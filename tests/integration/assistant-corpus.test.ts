import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { loadCorpus, seedAssistantCorpus } from "@/database/seed/steps/assistant.seed";
import { retrievePassages } from "@/modules/assistant";
import { createFixtureEmbeddingProvider } from "@/services/assistant";

// Recherche sur le vrai corpus (src/database/seed/assistant/corpus) avec les plongements de
// démonstration : pour 20 questions de producteurs, la fiche attendue doit figurer parmi les 5
// premiers extraits (rappel à 5), et en tête pour au moins 15 d'entre elles. Chaque fiche porte
// une source vérifiée (adresse https, licence, date de vérification) et la mention démonstration.

const QUESTIONS: Array<[string, string]> = [
  ["Quand semer le maïs et à quel écartement ?", "mais-semis-fertilisation"],
  ["Combien de sacs d'urée pour le deuxième apport sur le maïs ?", "mais-semis-fertilisation"],
  ["Comment reconnaître le striga, l'herbe sorcière, dans mon champ de maïs ?", "mais-striga"],
  [
    "Comment reconnaître la chenille légionnaire d'automne sur le maïs ?",
    "chenille-legionnaire-identifier",
  ],
  [
    "À partir de combien de plants attaqués faut-il traiter contre la chenille légionnaire ?",
    "chenille-legionnaire-lutte",
  ],
  ["Quelle longueur doivent avoir les boutures de manioc ?", "manioc-boutures"],
  [
    "Mes feuilles de manioc sont déformées avec des taches jaunes, est-ce la mosaïque ?",
    "manioc-mosaique",
  ],
  [
    "Comment produire des semenceaux d'igname avec la technique des minisetts ?",
    "igname-semenceaux",
  ],
  ["Comment stocker les tubercules d'igname après la récolte ?", "igname-stockage"],
  [
    "Comment aménager les diguettes et les canaux d'un bas-fond rizicole ?",
    "riz-bas-fond-amenagement",
  ],
  ["À quel âge repiquer les plants de riz de la pépinière ?", "riz-pepiniere-repiquage"],
  ["Quand récolter le riz paddy et comment le sécher ?", "riz-post-recolte-benin"],
  ["Comment conserver le niébé contre les bruches ?", "niebe-culture-conservation"],
  ["Pourquoi inoculer le soja avant le semis ?", "soja-inoculation-recolte"],
  ["Comment sécher les noix d'anacarde après la récolte ?", "anacarde-entretien-recolte"],
  ["Quel écartement pour semer le coton et quand démarier ?", "coton-calendrier-conduite"],
  ["Quand repiquer les plants de tomate de la pépinière ?", "tomate-pepiniere-repiquage"],
  ["Comment protéger les gousses de gombo de la punaise du cotonnier ?", "gombo-punaise"],
  ["Les mouches des fruits attaquent mes mangues, que faire ?", "mouches-des-fruits"],
  ["Comment faire le zaï pour résister aux poches de sécheresse ?", "zai-poches-seches"],
];

const embeddings = createFixtureEmbeddingProvider();

describe("corpus de l'assistant", () => {
  beforeAll(async () => {
    await seedAssistantCorpus();
  }, 240_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("porte sur chaque fiche une source vérifiée et la mention démonstration", async () => {
    const fiches = await loadCorpus();
    expect(fiches.length).toBeGreaterThanOrEqual(20);
    for (const { meta } of fiches) {
      expect(meta.source.url.startsWith("https://")).toBe(true);
      expect(meta.source.licence.length).toBeGreaterThan(3);
      expect(meta.source.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(meta.demonstration).toBe(true);
    }
  });

  it("retrouve la fiche attendue parmi les 5 premiers extraits pour les 20 questions", async () => {
    let first = 0;
    const misses: string[] = [];
    for (const [question, slug] of QUESTIONS) {
      const slugs = (await retrievePassages(question, embeddings, { limit: 5 })).map((p) => p.slug);
      if (slugs[0] === slug) first += 1;
      if (!slugs.includes(slug)) misses.push(`${question} → ${slugs.join(", ")}`);
    }
    expect(misses).toEqual([]);
    expect(first).toBeGreaterThanOrEqual(15);
  });
});
