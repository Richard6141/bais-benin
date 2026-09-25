import { z } from "zod";

// Contrat des commandes de synchronisation hors ligne (docs/modules/registre-parcours-ux.md §5,
// ADR-0005). Partagé par l'outbox du client et le point d'entrée serveur : la même validation
// s'applique des deux côtés, les messages d'erreur sont identiques.

const uuid = z.uuid();
const isoDate = z.iso.datetime({ offset: true });
const lngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const polygon = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(lngLat).min(4)).min(1),
});

export const farmerCreatePayload = z.object({
  id: uuid,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  gender: z.enum(["M", "F", "UNSPECIFIED"]).default("UNSPECIFIED"),
  birthYear: z.number().int().min(1900).max(2030).optional(),
  phone: z
    .string()
    .regex(/^\+22901\d{8}$/, "Numéro béninois attendu (+229 01 XX XX XX XX)")
    .optional(),
  communeCode: z.string().regex(/^BJ-[A-Z]{3}-\d{3}$/),
  village: z.string().trim().max(120).optional(),
  householdSize: z.number().int().min(1).max(60).optional(),
  consentAt: isoDate,
});

export const farmCreatePayload = z.object({
  id: uuid,
  farmerId: uuid,
  communeCode: z.string().regex(/^BJ-[A-Z]{3}-\d{3}$/),
  village: z.string().trim().max(120).optional(),
  location: lngLat,
  locationAccuracyM: z.number().min(0).max(5000).optional(),
  declaredAreaHa: z.number().positive("La superficie doit être supérieure à zéro").max(10_000),
  tenure: z.enum(["OWNED", "RENTED", "FAMILY", "SHARED", "UNKNOWN"]).default("UNKNOWN"),
  mainActivity: z.enum(["CROPS", "MIXED", "LIVESTOCK_DOMINANT"]).default("CROPS"),
  name: z.string().trim().max(120).optional(),
});

export const parcelCreatePayload = z.object({
  id: uuid,
  farmId: uuid,
  declaredAreaHa: z.number().positive().max(10_000),
  geometry: polygon.optional(),
  centroid: lngLat.optional(),
  captureMethod: z.enum(["GPS_WALK", "MAP_DRAW", "DECLARED_ONLY"]),
  gpsAccuracyM: z.number().min(0).max(5000).optional(),
  irrigation: z.enum(["NONE", "MANUAL", "DRIP", "FLOOD"]).default("NONE"),
  soilType: z.string().trim().max(60).optional(),
});

export const parcelGeometrySetPayload = z.object({
  parcelId: uuid,
  geometry: polygon,
  captureMethod: z.enum(["GPS_WALK", "MAP_DRAW"]),
  gpsAccuracyM: z.number().min(0).max(5000).optional(),
  expectedVersion: z.number().int().min(1),
});

export const cropSeasonDeclarePayload = z.object({
  id: uuid,
  parcelId: uuid,
  cropCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/),
  campaignCode: z.string().regex(/^\d{4}-\d{4}$/),
  seasonCode: z.enum(["MAIN_RAINY", "SHORT_RAINY", "DRY", "ANNUAL"]).default("MAIN_RAINY"),
  areaHa: z.number().positive().max(10_000).optional(),
  sowingDate: z.iso.date().optional(),
});

export const harvestDeclarePayload = z.object({
  id: uuid,
  parcelCropId: uuid,
  declaredQuantity: z.number().positive("La quantité doit être supérieure à zéro").max(1_000_000),
  unit: z.enum(["KG", "T", "BAG_100KG", "BAG_50KG", "BUNCH", "HEAP", "BASIN"]),
  declaredOn: z.iso.date(),
  // C2 : conservé dans le contrat pour la compatibilité du client hors ligne existant, mais
  // ignoré côté serveur pour décider de la fiabilité — harvest-declare.ts la déduit du rôle qui
  // a autorisé la commande, jamais de ce champ.
  declaredBy: z.enum(["FARMER", "AGENT"]),
  lossesPct: z.number().min(0).max(100).optional(),
  lossCause: z.string().trim().max(120).optional(),
  priceHintFcfaPerKg: z.number().min(0).max(100_000).optional(),
});

export const verificationRecordPayload = z.object({
  id: uuid,
  farmId: uuid,
  parcelId: uuid.optional(),
  kind: z.literal("FIELD_VISIT"),
  outcome: z.enum(["CONFIRMED", "CORRECTED", "REJECTED"]),
  notes: z.string().trim().max(1000).optional(),
  visitedAt: isoDate,
  gpsPoint: lngLat.optional(),
  identityConfirmed: z.boolean().default(false),
  // Corrections constatées sur place, appliquées à l'exploitation quand outcome = CORRECTED.
  correctedDeclaredAreaHa: z.number().positive().max(10_000).optional(),
});

// Relais oral d'une alerte par l'agent (docs/modules/monitoring-parcours-ux.md §2.B, B3) :
// le producteur sans téléphone ou sans consentement est prévenu de vive voix.
export const alertRelayPayload = z.object({
  id: uuid,
  alertId: uuid,
  farmId: uuid,
  mode: z.enum(["CALL", "VISIT", "GROUP_MEETING"]),
  note: z.string().trim().max(500).optional(),
  relayedAt: isoDate,
});

// Signalement de terrain (phase 0, docs/modules/signalements.md). La position vient du GPS de
// l'appareil s'il a été relevé, sinon de la parcelle ou de l'exploitation (côté serveur). La
// photo, facultative, arrive déjà réduite par l'appareil ; le serveur la réencode sans
// métadonnées avant de la stocker (modules/reports/photo.ts).
export const FIELD_REPORT_TYPES = ["PEST", "CROP_DISEASE", "ANIMAL_DISEASE", "OTHER"] as const;
// Environ 300 Ko d'image une fois décodée : quatre photos tiennent dans un lot de 2 Mo.
export const FIELD_REPORT_PHOTO_MAX_BASE64 = 400_000;

export const fieldReportCreatePayload = z.object({
  id: uuid,
  farmId: uuid,
  parcelId: uuid.optional(),
  type: z.enum(FIELD_REPORT_TYPES),
  cropCode: z
    .string()
    .regex(/^[A-Z_]{2,40}$/)
    .optional(),
  description: z
    .string()
    .trim()
    .min(5, "Décrivez le problème en quelques mots")
    .max(1000, "1 000 caractères au plus"),
  gps: z.object({ point: lngLat, accuracyM: z.number().min(0).max(5000).optional() }).optional(),
  observedAt: isoDate,
  photo: z
    .object({
      contentType: z.enum(["image/webp", "image/jpeg"]),
      dataBase64: z
        .string()
        .max(FIELD_REPORT_PHOTO_MAX_BASE64, "Photo trop lourde")
        .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Photo mal encodée"),
    })
    .optional(),
});

export const syncPayloadSchemas = {
  "farmer.create": farmerCreatePayload,
  "farm.create": farmCreatePayload,
  "parcel.create": parcelCreatePayload,
  "parcel.geometry.set": parcelGeometrySetPayload,
  "cropSeason.declare": cropSeasonDeclarePayload,
  "harvest.declare": harvestDeclarePayload,
  "verification.record": verificationRecordPayload,
  "alert.relay": alertRelayPayload,
  "fieldReport.create": fieldReportCreatePayload,
} as const;

export type SyncCommandType = keyof typeof syncPayloadSchemas;
export const SYNC_COMMAND_TYPES = Object.keys(syncPayloadSchemas) as SyncCommandType[];

export type SyncPayload = { [K in SyncCommandType]: z.infer<(typeof syncPayloadSchemas)[K]> };

// Enveloppe commune ; la charge utile est validée ensuite selon le type.
export const syncCommandEnvelopeSchema = z.object({
  id: uuid,
  type: z.enum(SYNC_COMMAND_TYPES as [SyncCommandType, ...SyncCommandType[]]),
  payload: z.unknown(),
  idempotencyKey: z.string().min(8).max(128),
  clientCreatedAt: isoDate,
  deviceId: z.string().min(4).max(128),
  dependsOn: z.array(uuid).max(20).optional(),
  expectedVersion: z.number().int().min(1).optional(),
});

export type SyncCommandEnvelope = z.infer<typeof syncCommandEnvelopeSchema>;

export interface SyncCommand<T extends SyncCommandType = SyncCommandType> extends Omit<
  SyncCommandEnvelope,
  "type" | "payload"
> {
  type: T;
  payload: SyncPayload[T];
}

export const syncBatchSchema = z.object({
  commands: z.array(syncCommandEnvelopeSchema).min(1).max(50),
});

export type SyncOutcome = "APPLIED" | "DUPLICATE" | "REJECTED" | "CONFLICT";

export interface SyncResult {
  id: string;
  outcome: SyncOutcome;
  entity?: { type: string; id: string; code?: string; version: number };
  error?: { code: string; message: string; field?: string };
  conflict?: { serverVersion: number; fields: Record<string, unknown> };
}

export interface SyncBatchResponse {
  results: SyncResult[];
  receivedAt: string;
}

// Validation typée d'une commande : enveloppe puis charge utile propre au type.
export function parseSyncCommand(
  input: unknown,
):
  | { ok: true; command: SyncCommand }
  | { ok: false; error: { code: string; message: string; field?: string }; id?: string } {
  const envelope = syncCommandEnvelopeSchema.safeParse(input);
  if (!envelope.success) {
    const issue = envelope.error.issues[0];
    return {
      ok: false,
      error: {
        code: "INVALID_ENVELOPE",
        message: issue?.message ?? "Commande illisible",
        field: issue?.path.join("."),
      },
      id:
        typeof (input as { id?: unknown })?.id === "string"
          ? (input as { id: string }).id
          : undefined,
    };
  }
  const schema = syncPayloadSchemas[envelope.data.type];
  const payload = schema.safeParse(envelope.data.payload);
  if (!payload.success) {
    const issue = payload.error.issues[0];
    return {
      ok: false,
      id: envelope.data.id,
      error: {
        code: "INVALID_PAYLOAD",
        message: issue?.message ?? "Charge utile invalide",
        field: issue?.path.join("."),
      },
    };
  }
  return { ok: true, command: { ...envelope.data, payload: payload.data } as SyncCommand };
}
