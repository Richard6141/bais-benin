import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/database/client";
import { logger } from "@/lib/logger";

// C4 : purge/anonymisation périodique, exigée par le principe de minimisation de l'APDP
// (Autorité de protection des données à caractère personnel, loi béninoise n° 2017-20) — les
// données personnelles ne doivent pas être conservées indéfiniment au seul motif qu'elles sont
// techniquement pratiques à garder. Deux tables identifiées par la revue de sécurité :
//
// - sync_command.payload : la charge utile brute d'une commande hors ligne (nom, téléphone,
//   position GPS…) reste utile pour l'idempotence et le débogage pendant quelques mois, mais
//   une fois APPLIED ou DUPLICATE, son contenu est déjà durablement reflété dans les tables
//   métier (farmer, farm, parcel…) : la charge utile elle-même devient une copie redondante de
//   données personnelles sans finalité propre passé ce délai.
// - audit_log.details : objet libre qui peut porter des identifiants ou des extraits de
//   contexte ; l'essentiel de la valeur d'audit (qui, quoi, quand, résultat) ne dépend pas de
//   ce champ, qui est donc celui qu'on efface en premier, bien après sync_command.payload
//   (l'audit a une finalité de traçabilité plus longue).
//
// Idempotent, sans effet sur les lignes déjà purgées (payload/details déjà vidés). Pensé pour
// une tâche planifiée mensuelle (cf. docker/scheduler, qui appelle déjà l'application sur un
// autre horaire pour le monitoring) ; exposé aussi en script direct (voir purge-personal-data.ts).

export const SYNC_PAYLOAD_RETENTION_DAYS = 180;
export const AUDIT_DETAILS_RETENTION_DAYS = 365;

const REDACTED_PAYLOAD: Prisma.InputJsonValue = { redacted: true, reason: "retention-expired" };

export interface RetentionSummary {
  syncCommandPayloadsPurged: number;
  auditLogDetailsPurged: number;
}

/** Efface la charge utile des commandes de synchronisation appliquées depuis plus de 180 jours. */
export async function purgeSyncCommandPayloads(
  now: Date = new Date(),
  retentionDays: number = SYNC_PAYLOAD_RETENTION_DAYS,
): Promise<number> {
  const threshold = new Date(now.getTime() - retentionDays * 86_400_000);
  const result = await prisma.syncCommand.updateMany({
    where: {
      clientCreatedAt: { lt: threshold },
      outcome: { in: ["APPLIED", "DUPLICATE"] },
      NOT: { payload: { equals: REDACTED_PAYLOAD } },
    },
    data: { payload: REDACTED_PAYLOAD },
  });
  return result.count;
}

/** Vide le détail libre des entrées d'audit vieilles de plus d'un an ; le reste de la ligne
 * (action, acteur, résultat, horodatage) est conservé pour la traçabilité. */
export async function purgeAuditLogDetails(
  now: Date = new Date(),
  retentionDays: number = AUDIT_DETAILS_RETENTION_DAYS,
): Promise<number> {
  const threshold = new Date(now.getTime() - retentionDays * 86_400_000);
  const result = await prisma.auditLog.updateMany({
    where: { occurredAt: { lt: threshold }, details: { not: Prisma.JsonNull } },
    data: { details: Prisma.JsonNull },
  });
  return result.count;
}

export async function runRetentionPurge(now: Date = new Date()): Promise<RetentionSummary> {
  const summary: RetentionSummary = {
    syncCommandPayloadsPurged: await purgeSyncCommandPayloads(now),
    auditLogDetailsPurged: await purgeAuditLogDetails(now),
  };
  logger.info(summary, "Purge des données personnelles au-delà de leur délai de conservation");
  return summary;
}
