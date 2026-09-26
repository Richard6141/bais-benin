import { prisma } from "@/database/client";
import type { Actor } from "@/modules/authorization";

// Ce que le formulaire « Solliciter l'État » propose sans rien faire saisir : les exploitations du
// producteur, et sa commune d'inscription pour une demande qui ne porte sur aucune exploitation.

export interface AssistanceFormContext {
  farms: { id: string; label: string; communeName: string }[];
  communes: { code: string; name: string }[];
  defaultCommuneCode: string | null;
}

export async function assistanceFormContext(actor: Actor): Promise<AssistanceFormContext> {
  const [farms, communes, farmer] = await Promise.all([
    prisma.farm.findMany({
      where: { archivedAt: null, farmer: { userId: actor.userId } },
      select: {
        id: true,
        code: true,
        name: true,
        village: true,
        commune: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.commune.findMany({
      where: { archivedAt: null },
      select: { code: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.farmer.findUnique({
      where: { userId: actor.userId },
      select: { commune: { select: { code: true } } },
    }),
  ]);
  return {
    farms: farms.map((farm) => ({
      id: farm.id,
      label: `${farm.name ?? farm.code}${farm.village ? ` (${farm.village})` : ""}`,
      communeName: farm.commune.name,
    })),
    communes,
    defaultCommuneCode: farmer?.commune.code ?? null,
  };
}
