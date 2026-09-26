import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/database/client";
import { recordAudit } from "@/modules/audit";
import { authorize, type Actor } from "@/modules/authorization";

// Attestation d'exploitation (plan d'action, chantier F) : le producteur prouve ses champs et ses
// récoltes auprès d'une banque, d'une assurance ou d'un programme de subvention. L'attestation est
// une photographie datée de l'exploitation, gardée telle quelle : on vérifie ce qui a été attesté
// ce jour-là, pas ce que dit le registre aujourd'hui. Le code QR mène à une page publique qui dit
// si l'attestation existe et n'a pas été retirée. Le NPI n'y figure jamais : seulement le fait
// que l'identité a été contrôlée auprès de l'ANIP.

// Sans lettres ni chiffres qui se confondent (0 et O, 1 et I et L) : le code se recopie à la main.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 16;

export function newAttestationCode(bytes: Buffer = randomBytes(CODE_LENGTH)): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) code += ALPHABET[bytes[i]! % ALPHABET.length];
  return code;
}

/** « ABCD-EFGH-JKMN-PQRS » pour l'affichage ; la saisie accepte tirets, espaces et minuscules. */
export function formatAttestationCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

export function normalizeAttestationCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c)) ? code : null;
}

const snapshotSchema = z.object({
  version: z.literal(1),
  holder: z.object({ displayName: z.string(), identityVerified: z.boolean() }),
  farm: z.object({
    code: z.string(),
    name: z.string().nullable(),
    village: z.string().nullable(),
    communeName: z.string(),
    departementName: z.string(),
    verificationStatus: z.string(),
    verifiedAt: z.string().nullable(),
  }),
  parcels: z.number(),
  declaredAreaHa: z.number(),
  measuredAreaHa: z.number().nullable(),
  campaign: z
    .object({
      code: z.string(),
      crops: z.array(z.object({ name: z.string(), areaHa: z.number() })),
    })
    .nullable(),
  harvests: z.array(
    z.object({ campaignCode: z.string(), cropName: z.string(), quantityKg: z.number() }),
  ),
});
export type AttestationSnapshot = z.infer<typeof snapshotSchema>;

export interface AttestationView {
  code: string;
  issuedAt: Date;
  revokedAt: Date | null;
  issuerRole: "PRODUCTEUR" | "AGENT" | "MINISTERE";
  snapshot: AttestationSnapshot;
}

export class AttestationError extends Error {
  constructor(readonly code: "NOT_FOUND" | "FORBIDDEN") {
    super(code);
    this.name = "AttestationError";
  }
}

const round = (value: number) => Math.round(value * 100) / 100;

async function readableFarm(actor: Actor, farmId: string) {
  const farm = await prisma.farm.findFirst({
    where: { id: farmId, archivedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      village: true,
      communeId: true,
      registeredById: true,
      verificationStatus: true,
      verifiedAt: true,
      commune: {
        select: { name: true, departementId: true, departement: { select: { name: true } } },
      },
      farmer: {
        select: {
          firstName: true,
          lastName: true,
          userId: true,
          user: { select: { npiStatus: true } },
        },
      },
    },
  });
  if (!farm) return null;
  const allowed = authorize(actor, "farm.read", {
    ownerUserId: farm.farmer.userId,
    registeredByUserId: farm.registeredById,
    communeId: farm.communeId,
    departementId: farm.commune.departementId,
  }).allowed;
  return allowed ? farm : null;
}

/** Photographie de l'exploitation au moment de l'émission. */
export async function buildSnapshot(
  farmId: string,
): Promise<Omit<AttestationSnapshot, "holder" | "farm">> {
  const [parcels, campaign, harvests] = await Promise.all([
    prisma.parcel.findMany({
      where: { farmId, archivedAt: null },
      select: { declaredAreaHa: true, computedAreaHa: true },
    }),
    prisma.agriculturalCampaign.findFirst({
      where: { status: "OPEN" },
      select: { id: true, code: true },
    }),
    prisma.productionDeclaration.findMany({
      where: {
        archivedAt: null,
        parcelCrop: { archivedAt: null, parcel: { farmId, archivedAt: null } },
      },
      select: {
        quantityKg: true,
        parcelCrop: {
          select: { crop: { select: { nameFr: true } }, campaign: { select: { code: true } } },
        },
      },
    }),
  ]);
  const crops = campaign
    ? await prisma.parcelCrop.findMany({
        where: {
          archivedAt: null,
          campaignId: campaign.id,
          parcel: { farmId, archivedAt: null },
        },
        select: { areaHa: true, crop: { select: { nameFr: true } } },
      })
    : [];
  const cropArea = new Map<string, number>();
  for (const crop of crops) {
    cropArea.set(crop.crop.nameFr, (cropArea.get(crop.crop.nameFr) ?? 0) + Number(crop.areaHa));
  }
  const harvestTotals = new Map<
    string,
    { campaignCode: string; cropName: string; quantityKg: number }
  >();
  for (const harvest of harvests) {
    const key = `${harvest.parcelCrop.campaign.code}|${harvest.parcelCrop.crop.nameFr}`;
    const entry = harvestTotals.get(key) ?? {
      campaignCode: harvest.parcelCrop.campaign.code,
      cropName: harvest.parcelCrop.crop.nameFr,
      quantityKg: 0,
    };
    entry.quantityKg += Number(harvest.quantityKg);
    harvestTotals.set(key, entry);
  }
  const measured = parcels.every((p) => p.computedAreaHa !== null) && parcels.length > 0;
  return {
    version: 1,
    parcels: parcels.length,
    declaredAreaHa: round(parcels.reduce((sum, p) => sum + Number(p.declaredAreaHa), 0)),
    measuredAreaHa: measured
      ? round(parcels.reduce((sum, p) => sum + Number(p.computedAreaHa), 0))
      : null,
    campaign: campaign
      ? {
          code: campaign.code,
          crops: [...cropArea.entries()]
            .map(([name, areaHa]) => ({ name, areaHa: round(areaHa) }))
            .sort((a, b) => b.areaHa - a.areaHa),
        }
      : null,
    harvests: [...harvestTotals.values()]
      .map((h) => ({ ...h, quantityKg: Math.round(h.quantityKg) }))
      .sort((a, b) => (a.campaignCode < b.campaignCode ? 1 : -1))
      .slice(0, 8),
  };
}

function issuerRole(actor: Actor): AttestationView["issuerRole"] {
  const roles = new Set(actor.grants.map((grant) => grant.role));
  if (roles.has("ADMIN_STATE")) return "MINISTERE";
  if (roles.has("AGENT_AGRICULTURE")) return "AGENT";
  return "PRODUCTEUR";
}

/** Émet une attestation pour une exploitation que l'acteur peut lire ; renvoie son code. */
export async function issueAttestation(actor: Actor, farmId: string): Promise<string> {
  const farm = await readableFarm(actor, farmId);
  if (!farm) throw new AttestationError("NOT_FOUND");
  const snapshot: AttestationSnapshot = {
    ...(await buildSnapshot(farm.id)),
    holder: {
      displayName: `${farm.farmer.firstName} ${farm.farmer.lastName}`,
      identityVerified: farm.farmer.user?.npiStatus === "VERIFIED",
    },
    farm: {
      code: farm.code,
      name: farm.name,
      village: farm.village,
      communeName: farm.commune.name,
      departementName: farm.commune.departement.name,
      verificationStatus: farm.verificationStatus,
      verifiedAt: farm.verifiedAt?.toISOString() ?? null,
    },
  };
  const code = newAttestationCode();
  await prisma.farmAttestation.create({
    data: {
      code,
      farmId: farm.id,
      issuedById: actor.userId,
      snapshot: { ...snapshot, issuerRole: issuerRole(actor) },
    },
  });
  await recordAudit({
    action: "registry.attestation.issued",
    actorId: actor.userId,
    resourceType: "farm",
    resourceId: farm.id,
  });
  return code;
}

function toView(row: {
  code: string;
  issuedAt: Date;
  revokedAt: Date | null;
  snapshot: unknown;
}): AttestationView | null {
  const raw = (row.snapshot ?? {}) as Record<string, unknown>;
  const parsed = snapshotSchema.safeParse(raw);
  if (!parsed.success) return null;
  const role = raw.issuerRole;
  return {
    code: row.code,
    issuedAt: row.issuedAt,
    revokedAt: row.revokedAt,
    issuerRole: role === "MINISTERE" || role === "AGENT" ? role : "PRODUCTEUR",
    snapshot: parsed.data,
  };
}

/** Lecture publique par le code du QR : existe-t-elle, a-t-elle été retirée, que dit-elle. */
export async function verifyAttestation(input: string): Promise<AttestationView | null> {
  const code = normalizeAttestationCode(input);
  if (!code) return null;
  const row = await prisma.farmAttestation.findUnique({
    where: { code },
    select: { code: true, issuedAt: true, revokedAt: true, snapshot: true },
  });
  return row ? toView(row) : null;
}

/** Attestations d'une exploitation lisible par l'acteur, les plus récentes d'abord. */
export async function listFarmAttestations(
  actor: Actor,
  farmId: string,
): Promise<AttestationView[]> {
  const farm = await readableFarm(actor, farmId);
  if (!farm) throw new AttestationError("NOT_FOUND");
  const rows = await prisma.farmAttestation.findMany({
    where: { farmId: farm.id },
    orderBy: { issuedAt: "desc" },
    take: 20,
    select: { code: true, issuedAt: true, revokedAt: true, snapshot: true },
  });
  return rows.map(toView).filter((view): view is AttestationView => view !== null);
}

/** Retire une attestation (déclaration erronée, perte du document) ; la page publique le dira. */
export async function revokeAttestation(actor: Actor, input: string): Promise<void> {
  const code = normalizeAttestationCode(input);
  const row = code
    ? await prisma.farmAttestation.findUnique({
        where: { code },
        select: { id: true, farmId: true, revokedAt: true },
      })
    : null;
  if (!row || !(await readableFarm(actor, row.farmId))) throw new AttestationError("NOT_FOUND");
  if (row.revokedAt) return;
  await prisma.farmAttestation.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  await recordAudit({
    action: "registry.attestation.revoked",
    actorId: actor.userId,
    resourceType: "farm",
    resourceId: row.farmId,
  });
}
