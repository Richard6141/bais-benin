import { prisma } from "@/database/client";
import { authorize, scopeFilter, type Actor } from "@/modules/authorization";
import { getCommuneWeather } from "@/modules/monitoring";
import { AssistantError } from "./errors";

// Contexte d'une question, limité au périmètre de l'utilisateur (assistant-parcours-ux §0) :
// producteur = ses exploitations ; agent = l'exploitation choisie de son périmètre (ou aucune) ;
// ministère = pas de contexte individuel, seulement la liste des indicateurs. Jamais de NPI, de
// téléphone ni de nom de tiers : des cultures, des stades, des alertes et la météo communale.

export type AssistantAudience = "FARMER" | "AGENT" | "MINISTRY";

export interface ContextFact {
  text: string;
  source: string;
}

export interface AssistantContext {
  audience: AssistantAudience;
  communeId: string | null;
  farmId: string | null;
  /** Code de l'exploitation choisie : affiché à l'agent, jamais transmis au modèle. */
  farmCode: string | null;
  crops: string[];
  facts: ContextFact[];
}

const STAGE_WORDS: Record<string, string> = {
  PLANNED: "prévu",
  SOWN: "semé",
  GROWING: "en croissance",
  FLOWERING: "en floraison",
  HARVESTED: "récolté",
  FAILED: "perdu",
};

const SEVERITY_WORDS: Record<string, string> = {
  INFO: "information",
  WATCH: "vigilance",
  WARNING: "alerte",
  CRITICAL: "alerte grave",
};

export function audienceOf(actor: Actor): AssistantAudience {
  if (scopeFilter(actor, "assistant.ask").kind === "none") {
    throw new AssistantError("FORBIDDEN", "L'assistant n'est pas ouvert à ce compte");
  }
  const roles = new Set(actor.grants.map((g) => g.role));
  if (roles.has("ADMIN_STATE")) return "MINISTRY";
  if (roles.has("AGENT_AGRICULTURE")) return "AGENT";
  if (roles.has("FARMER") || roles.has("COOPERATIVE")) return "FARMER";
  throw new AssistantError("FORBIDDEN", "L'assistant n'est pas ouvert à ce compte");
}

async function communeFacts(communeId: string): Promise<ContextFact[]> {
  const commune = await prisma.commune.findUnique({
    where: { id: communeId },
    select: { code: true, name: true },
  });
  if (!commune) return [];
  const [alerts, weather] = await Promise.all([
    prisma.alert.findMany({
      where: { communeId, status: "ACTIVE" },
      select: { title: true, severity: true },
      orderBy: { startsAt: "desc" },
      take: 3,
    }),
    getCommuneWeather(commune.code),
  ]);
  const facts: ContextFact[] = alerts.map((a) => ({
    text: `Alerte en cours à ${commune.name} : ${a.title} (${SEVERITY_WORDS[a.severity] ?? a.severity})`,
    source: "Alertes agro-climatiques BAIS",
  }));
  if (weather?.rain10dMm !== null && weather?.rain10dMm !== undefined) {
    facts.push({
      text: `Pluie des 10 derniers jours à ${commune.name} : ${Math.round(weather.rain10dMm)} mm`,
      source: weather.source,
    });
  }
  return facts;
}

async function farmFacts(farmIds: string[]): Promise<{ crops: string[]; facts: ContextFact[] }> {
  const rows = await prisma.parcelCrop.findMany({
    where: {
      archivedAt: null,
      campaign: { status: "OPEN" },
      parcel: { archivedAt: null, farmId: { in: farmIds } },
    },
    select: { stage: true, crop: { select: { code: true, nameFr: true } } },
  });
  const byCrop = new Map<string, { name: string; stages: Set<string> }>();
  for (const row of rows) {
    const entry = byCrop.get(row.crop.code) ?? { name: row.crop.nameFr, stages: new Set() };
    entry.stages.add(STAGE_WORDS[row.stage] ?? row.stage);
    byCrop.set(row.crop.code, entry);
  }
  const crops = [...byCrop.keys()];
  const facts: ContextFact[] =
    crops.length === 0
      ? []
      : [
          {
            text: `Cultures de la campagne : ${[...byCrop.values()]
              .map((c) => `${c.name.toLowerCase()} (${[...c.stages].join(", ")})`)
              .join(", ")}`,
            source: "Registre BAIS",
          },
        ];
  return { crops, facts };
}

export async function buildContext(actor: Actor, farmCode?: string): Promise<AssistantContext> {
  const audience = audienceOf(actor);
  if (audience === "MINISTRY") {
    return { audience, communeId: null, farmId: null, farmCode: null, crops: [], facts: [] };
  }
  if (audience === "FARMER") {
    const farms = await prisma.farm.findMany({
      where: { archivedAt: null, farmer: { userId: actor.userId } },
      select: { id: true, communeId: true },
    });
    const communeId = farms[0]?.communeId ?? null;
    const { crops, facts } = await farmFacts(farms.map((f) => f.id));
    return {
      audience,
      communeId,
      farmId: farms.length === 1 ? farms[0]!.id : null,
      farmCode: null,
      crops,
      facts: [...facts, ...(communeId ? await communeFacts(communeId) : [])],
    };
  }
  if (!farmCode) {
    return { audience, communeId: null, farmId: null, farmCode: null, crops: [], facts: [] };
  }
  const farm = await prisma.farm.findFirst({
    where: { code: farmCode, archivedAt: null },
    select: {
      id: true,
      code: true,
      communeId: true,
      registeredById: true,
      commune: { select: { departementId: true } },
    },
  });
  const allowed =
    farm &&
    authorize(actor, "farm.read", {
      communeId: farm.communeId,
      departementId: farm.commune.departementId,
      registeredByUserId: farm.registeredById,
    }).allowed;
  // Hors périmètre : même réponse qu'une exploitation inconnue.
  if (!farm || !allowed) throw new AssistantError("NOT_FOUND", "Exploitation introuvable");
  const { crops, facts } = await farmFacts([farm.id]);
  return {
    audience,
    communeId: farm.communeId,
    farmId: farm.id,
    farmCode: farm.code,
    crops,
    facts: [...facts, ...(await communeFacts(farm.communeId))],
  };
}
