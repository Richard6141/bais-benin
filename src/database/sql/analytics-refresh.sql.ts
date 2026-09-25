import { z } from "zod";
import { prisma } from "@/database/client";
import { Prisma } from "@/generated/prisma/client";

// Rafraîchissement des vues matérialisées du tableau de bord (migration analytics_views).
// `REFRESH MATERIALIZED VIEW CONCURRENTLY` laisse les lectures se poursuivre sur l'ancien
// contenu ; le nom de vue vient d'une liste fermée, jamais d'une entrée.

export const ANALYTICS_VIEWS = ["mv_farm_stats_by_commune", "mv_crop_stats_by_commune"] as const;
export type AnalyticsView = (typeof ANALYTICS_VIEWS)[number];

export interface ViewRefresh {
  view: AnalyticsView;
  durationMs: number;
  rowCount: number;
  refreshedAt: Date;
}

export async function refreshView(view: AnalyticsView): Promise<ViewRefresh> {
  if (!ANALYTICS_VIEWS.includes(view)) throw new Error(`Vue inconnue : ${view}`);
  const started = performance.now();
  await prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY "${view}"`);
  const durationMs = Math.round(performance.now() - started);
  const counted = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM ${Prisma.raw(`"${view}"`)}`;
  const rowCount = counted[0]?.n ?? 0;
  const refreshedAt = new Date();
  await prisma.analyticsRefresh.upsert({
    where: { viewName: view },
    create: { viewName: view, refreshedAt, durationMs, rowCount },
    update: { refreshedAt, durationMs, rowCount },
  });
  return { view, durationMs, rowCount, refreshedAt };
}

export async function readRefreshTimes(): Promise<Map<AnalyticsView, Date>> {
  const rows = await prisma.analyticsRefresh.findMany();
  return new Map(
    rows
      .filter((r) => (ANALYTICS_VIEWS as readonly string[]).includes(r.viewName))
      .map((r) => [r.viewName as AnalyticsView, r.refreshedAt]),
  );
}

const lastChangeSchema = z.object({ last_change: z.coerce.date().nullable() });

// Dernière écriture dans le registre, toutes tables agrégées confondues : exploitations,
// parcelles, cultures, récoltes, vérifications, producteurs, commandes de synchronisation.
export async function readRegistryLastChange(): Promise<Date | null> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT GREATEST(
      (SELECT max("updated_at") FROM "farm"),
      (SELECT max("updated_at") FROM "farmer"),
      (SELECT max("updated_at") FROM "parcel"),
      (SELECT max("updated_at") FROM "parcel_crop"),
      (SELECT max("updated_at") FROM "production_declaration"),
      (SELECT max("created_at") FROM "farm_verification"),
      (SELECT max("applied_at") FROM "sync_command")
    ) AS last_change`;
  return lastChangeSchema.parse(rows[0] ?? { last_change: null }).last_change;
}
