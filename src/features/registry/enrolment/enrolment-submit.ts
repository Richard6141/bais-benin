import { parseAmount } from "@/components/forms/unit-amount-field";
import type { AgentDatabase, LocalFarm } from "@/lib/offline/db";
import { enqueueCommand } from "@/lib/offline/outbox";
import type { SyncPayload } from "@/modules/sync/commands";
import { loadEnrolmentDraft, markEnrolmentSubmitted } from "./enrolment-draft";
import type { EnrolmentData, EnrolmentResult } from "./enrolment-types";

// Transforme un brouillon complet en commandes ordonnées de l'outbox (ADR-0005) : producteur si
// nouveau, exploitation, parcelles, cultures. Les identifiants sont tirés côté client et servent
// de clé d'idempotence ; les dépendances garantissent l'ordre d'application côté serveur.

export interface SubmitContext {
  campaignCode: string;
  /** Cycle par culture, pour rattacher les pérennes à la campagne entière plutôt qu'à une sous-saison. */
  cropCycles: Readonly<Record<string, string>>;
  now?: () => Date;
  newId?: () => string;
}

export class EnrolmentIncompleteError extends Error {
  constructor(public readonly field: string) {
    super(`Brouillon incomplet : ${field}`);
    this.name = "EnrolmentIncompleteError";
  }
}

/** Code provisoire lisible, remplacé par le code serveur à la synchronisation. */
export function provisionalFarmCode(communeCode: string, farmId: string): string {
  return `${communeCode}-L${farmId.replace(/-/g, "").slice(-6).toUpperCase()}`;
}

function toE164(nationalDigits: string | undefined): string | undefined {
  if (!nationalDigits || nationalDigits.length !== 10) return undefined;
  return `+229${nationalDigits}`;
}

export function buildCommands(data: EnrolmentData, context: SubmitContext) {
  const { farmer, location, size, consentAt } = data;
  if (!farmer) throw new EnrolmentIncompleteError("farmer");
  if (!location) throw new EnrolmentIncompleteError("location");
  if (!size) throw new EnrolmentIncompleteError("size");
  if (!consentAt) throw new EnrolmentIncompleteError("consentAt");
  const areaHa = parseAmount(size.areaHa);
  if (!(areaHa > 0)) throw new EnrolmentIncompleteError("size.areaHa");

  const newId = context.newId ?? (() => crypto.randomUUID());
  const commands: Array<
    {
      [K in keyof SyncPayload]: {
        id: string;
        type: K;
        payload: SyncPayload[K];
        dependsOn?: string[];
      };
    }[keyof SyncPayload]
  > = [];

  let farmerId: string;
  if (farmer.mode === "NEW") {
    if (!farmer.firstName || !farmer.lastName) throw new EnrolmentIncompleteError("farmer.name");
    farmerId = newId();
    commands.push({
      id: farmerId,
      type: "farmer.create",
      payload: {
        id: farmerId,
        firstName: farmer.firstName,
        lastName: farmer.lastName,
        gender: farmer.gender ?? "UNSPECIFIED",
        birthYear: farmer.birthYear,
        phone: toE164(farmer.phone),
        communeCode: location.communeCode,
        consentAt,
      },
    });
  } else {
    if (!farmer.existingFarmerId) throw new EnrolmentIncompleteError("farmer.existingFarmerId");
    farmerId = farmer.existingFarmerId;
  }

  const farmId = newId();
  commands.push({
    id: farmId,
    type: "farm.create",
    payload: {
      id: farmId,
      farmerId,
      communeCode: location.communeCode,
      location: [location.position.lng, location.position.lat],
      locationAccuracyM: location.position.accuracyM,
      declaredAreaHa: areaHa,
      tenure: size.tenure,
      mainActivity: "CROPS",
    },
    dependsOn: farmer.mode === "NEW" ? [farmerId] : undefined,
  });

  // Sans parcelle décrite, les cultures de l'exploitation sont portées par une parcelle implicite
  // couvrant toute la superficie : le schéma cropSeason.declare exige une parcelle.
  const parcels =
    data.parcels.length > 0
      ? data.parcels
      : data.crops && data.crops.cropCodes.length > 0
        ? [{ id: newId(), name: "Parcelle 1", areaHa, cropCodes: data.crops.cropCodes }]
        : [];
  const seasonCode = data.crops?.seasonCode ?? "MAIN_RAINY";

  for (const parcel of parcels) {
    commands.push({
      id: parcel.id,
      type: "parcel.create",
      payload: {
        id: parcel.id,
        farmId,
        declaredAreaHa: parcel.areaHa,
        centroid: [location.position.lng, location.position.lat],
        captureMethod: "DECLARED_ONLY",
        gpsAccuracyM: location.position.accuracyM,
        irrigation: size.irrigation,
      },
      dependsOn: [farmId],
    });
    const share = parcel.cropCodes.length > 0 ? parcel.areaHa / parcel.cropCodes.length : 0;
    for (const cropCode of parcel.cropCodes) {
      const cropSeasonId = newId();
      const cycle = context.cropCycles[cropCode];
      commands.push({
        id: cropSeasonId,
        type: "cropSeason.declare",
        payload: {
          id: cropSeasonId,
          parcelId: parcel.id,
          cropCode,
          campaignCode: context.campaignCode,
          seasonCode: cycle === "PERENNIAL" || cycle === "GATHERED" ? "ANNUAL" : seasonCode,
          areaHa: share > 0 ? Math.round(share * 1000) / 1000 : undefined,
        },
        dependsOn: [parcel.id],
      });
    }
  }

  return { commands, farmId, farmerId, parcels };
}

export async function submitEnrolment(
  db: AgentDatabase,
  draftId: string,
  context: SubmitContext,
): Promise<EnrolmentResult> {
  const draft = await loadEnrolmentDraft(db, draftId);
  if (!draft) throw new Error("Brouillon introuvable");
  if (draft.data.result) return draft.data.result;
  const { commands, farmId, farmerId, parcels } = buildCommands(draft.data, context);
  const location = draft.data.location!;
  const farmer = draft.data.farmer!;
  const now = (context.now ?? (() => new Date()))().toISOString();

  await db.transaction("rw", db.outbox, db.farms, db.drafts, async () => {
    for (const command of commands) {
      await enqueueCommand(db, { ...command, draftId });
    }
    const farmerName =
      farmer.mode === "EXISTING"
        ? (farmer.existingFarmerName ?? "Producteur")
        : `${farmer.firstName} ${farmer.lastName}`;
    const localFarm: LocalFarm = {
      id: farmId,
      code: provisionalFarmCode(location.communeCode, farmId),
      farmerId,
      farmerName,
      communeCode: location.communeCode,
      communeName: location.communeName,
      verificationStatus: "DECLARED",
      declaredAreaHa: parseAmount(draft.data.size!.areaHa),
      parcelCount: parcels.length,
      cropCodes: [...new Set(parcels.flatMap((parcel) => parcel.cropCodes))],
      version: 0,
      syncState: "LOCAL_ONLY",
      updatedAt: now,
    };
    await db.farms.put(localFarm);
    const result: EnrolmentResult = { farmId, farmCode: localFarm.code, farmerId };
    await markEnrolmentSubmitted(db, draftId, result, farmId);
  });

  return { farmId, farmCode: provisionalFarmCode(location.communeCode, farmId), farmerId };
}
