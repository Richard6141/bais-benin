import type { Prisma } from "@/generated/prisma/client";
import type { SyncCommand } from "./commands";

// Charge utile conservée dans le journal des commandes (sync_command). La photo d'un signalement
// n'y est jamais recopiée : elle y resterait des mois telle que l'appareil l'a envoyée,
// métadonnées comprises (EXIF, position du téléphone). Seule sa version réencodée sans
// métadonnées est conservée (field_report_photo).
export function storedPayload(command: SyncCommand): Prisma.InputJsonValue {
  const payload = command.payload as Record<string, unknown>;
  const photo = payload.photo as { contentType?: string } | undefined;
  if (command.type !== "fieldReport.create" || !photo) return payload as Prisma.InputJsonValue;
  return { ...payload, photo: { contentType: photo.contentType, omitted: true } };
}
