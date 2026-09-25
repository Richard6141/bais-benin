import { contentWords } from "@/lib/text/normalize";
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "@/services/ports/embedding-provider";

// Plongements de démonstration, déterministes et sans réseau : hachage des mots (et de leurs
// trigrammes de caractères, à poids moindre) dans un vecteur de dimension fixe, normalisé.
// La similarité obtenue est lexicale, pas sémantique : elle suffit à retrouver la bonne fiche
// quand la question emploie ses mots, ce que les tests vérifient. Même texte, même vecteur.

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function add(vector: Float64Array, feature: string, weight: number): void {
  const hash = fnv1a(feature);
  const index = hash % vector.length;
  // Signe tiré d'un autre bit du hachage : les collisions se compensent au lieu de s'accumuler.
  vector[index]! += (hash & 0x80000000 ? -1 : 1) * weight;
}

/**
 * Référence enregistrée avec chaque extrait. Le numéro change avec l'algorithme (normalisation,
 * hachage) : les extraits calculés avec une version antérieure sont alors recalculés au seed.
 */
export const FIXTURE_EMBEDDING_REF = "fixture:4";

export function hashEmbedding(text: string, dimensions = EMBEDDING_DIMENSIONS): number[] {
  const vector = new Float64Array(dimensions);
  const words = contentWords(text);
  for (const word of words) {
    add(vector, `w:${word}`, 1);
    const padded = `#${word}#`;
    for (let i = 0; i + 3 <= padded.length; i += 1)
      add(vector, `t:${padded.slice(i, i + 3)}`, 0.25);
  }
  for (let i = 0; i + 1 < words.length; i += 1) add(vector, `b:${words[i]} ${words[i + 1]}`, 0.5);
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return Array.from(vector, (v) => (norm > 0 ? v / norm : 0));
}

export function createFixtureEmbeddingProvider(): EmbeddingProvider {
  return {
    modelRef: FIXTURE_EMBEDDING_REF,
    dimensions: EMBEDDING_DIMENSIONS,
    embed: async (values) => values.map((value) => hashEmbedding(value)),
    // Similarité lexicale : un extrait long partage peu de mots avec une question courte, le
    // cosinus reste bas (0,15 à 0,45 pour un bon extrait). Ramené à une échelle de 0 à 1.
    relevance: (similarity) => Math.min(1, Math.max(0, similarity * 2.5)),
  };
}
