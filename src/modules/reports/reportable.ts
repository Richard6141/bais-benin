import { prisma } from "@/database/client";
import type { Prisma } from "@/generated/prisma/client";
import { scopeFilter, type Actor } from "@/modules/authorization";

// Exploitations sur lesquelles l'acteur peut signaler un problème (report.create) : les siennes
// pour un producteur, celles qu'il a enregistrées pour un agent. Avec leurs parcelles et les
// cultures de la campagne en cours, pour que le formulaire ne demande rien qui soit déjà connu.

export interface ReportableFarm {
  id: string;
  code: string;
  name: string | null;
  village: string | null;
  parcels: { id: string; code: string; areaHa: number; cropCodes: string[] }[];
}

function createScope(actor: Actor): Prisma.FarmWhereInput | null {
  const filter = scopeFilter(actor, "report.create");
  switch (filter.kind) {
    case "all":
      return {};
    case "self":
      return { farmer: { userId: filter.userId } };
    case "registered":
      return { registeredById: filter.userId };
    case "territory":
      return filter.communeIds.length > 0 ? { communeId: { in: filter.communeIds } } : null;
    case "none":
      return null;
  }
}

export async function listReportableFarms(actor: Actor, limit = 50): Promise<ReportableFarm[]> {
  const scope = createScope(actor);
  if (scope === null) return [];
  const farms = await prisma.farm.findMany({
    where: { AND: [scope, { archivedAt: null }] },
    select: {
      id: true,
      code: true,
      name: true,
      village: true,
      parcels: {
        where: { archivedAt: null },
        orderBy: { code: "asc" },
        select: {
          id: true,
          code: true,
          declaredAreaHa: true,
          crops: {
            where: { archivedAt: null, campaign: { status: "OPEN" } },
            select: { crop: { select: { code: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return farms.map((farm) => ({
    id: farm.id,
    code: farm.code,
    name: farm.name,
    village: farm.village,
    parcels: farm.parcels.map((parcel) => ({
      id: parcel.id,
      code: parcel.code,
      areaHa: Number(parcel.declaredAreaHa),
      cropCodes: [...new Set(parcel.crops.map((c) => c.crop.code))],
    })),
  }));
}
