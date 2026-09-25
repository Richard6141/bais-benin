import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import { ingestCorpus, parseFiche } from "@/modules/assistant";
import type { Actor } from "@/modules/authorization";
import { loadActor } from "@/modules/identity";
import {
  createFixtureEmbeddingProvider,
  createFixtureLlmProvider,
  type AssistantProviders,
} from "@/services/assistant";

// Préparation commune des suites de l'assistant : corpus de test dédié (slugs
// « test-assistant-… »), adaptateurs de démonstration, comptes producteur, agent et ministère.
// Le nettoyage retire les fiches de test, les conversations créées et les lectures du journal.

export const SLUG = "test-assistant";
export const embeddings = createFixtureEmbeddingProvider();
export const providers: AssistantProviders = { llm: createFixtureLlmProvider(), embeddings };

const source = (title: string) => ({
  organization: "Suite de tests",
  title,
  url: "https://example.org/fiche-de-test",
  licence: "Texte de test",
  published: null,
  checkedOn: "2026-09-25",
});

const fiche = (slug: string, meta: object, body: string) =>
  parseFiche(
    `---\n${JSON.stringify({ slug: `${SLUG}-${slug}`, demonstration: true, ...meta })}\n---\n${body}`,
  );

export const FICHES = [
  fiche(
    "chenille",
    {
      title: "Chenille légionnaire du maïs",
      crops: ["MAIZE"],
      topics: ["ravageurs"],
      source: source("Chenille"),
    },
    "# Chenille légionnaire\n\n## Reconnaître\n\nLa chenille légionnaire d'automne attaque le cornet du maïs. Les feuilles portent des trous et des excréments en sciure.\n\n## Lutter\n\nInspectez les plants de maïs deux fois par semaine pendant les six premières semaines.\n- Écrasez les masses d'œufs et les jeunes chenilles à la main.",
  ),
  fiche(
    "igname",
    {
      title: "Conserver les ignames",
      crops: ["YAM"],
      topics: ["conservation"],
      source: source("Igname"),
    },
    "# Igname\n\n## Stockage\n\nConservez les ignames saines dans une case aérée, à l'ombre, sur des claies. Retirez chaque semaine les tubercules pourris.\n- Ne lavez pas les tubercules avant le stockage.",
  ),
  fiche(
    "niebe",
    {
      title: "Conserver le niébé",
      crops: ["COWPEA"],
      topics: ["conservation"],
      source: source("Niébé"),
    },
    "# Niébé\n\n## Contre les bruches\n\nSéchez bien les graines de niébé puis stockez-les dans des sacs hermétiques à triple fond. Fermez chaque sac sans laisser d'air.\n- Gardez les sacs fermés au moins deux mois.",
  ),
];

export interface AssistantActors {
  farmer: Actor;
  agent: Actor;
  ministry: Actor;
}

async function actorOf(where: Parameters<typeof prisma.user.findFirstOrThrow>[0]) {
  return loadActor((await prisma.user.findFirstOrThrow(where)).id);
}

export async function setupAssistant(): Promise<AssistantActors> {
  await seedReferenceData();
  await ingestCorpus(FICHES, embeddings);
  return {
    farmer: await actorOf({
      where: { farmer: { isNot: null }, roles: { some: { role: "FARMER" } } },
    }),
    agent: await actorOf({ where: { phoneNumber: "+2290190000001" } }),
    ministry: await actorOf({ where: { email: "ministere@bais.demo" } }),
  };
}

export async function cleanupAssistant(actors: AssistantActors, since: Date): Promise<void> {
  await prisma.assistantConversation.deleteMany({
    where: {
      userId: { in: [actors.farmer.userId, actors.agent.userId, actors.ministry.userId] },
      createdAt: { gte: since },
    },
  });
  await prisma.assistantDocument.deleteMany({ where: { slug: { startsWith: SLUG } } });
  await prisma.auditLog.deleteMany({
    where: { action: "assistant.journal.read", occurredAt: { gte: since } },
  });
}
