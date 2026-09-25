// Port des plongements de l'assistant : texte vers vecteur de dimension fixe, comparé par
// similarité cosinus dans pgvector. La dimension doit être celle de la colonne
// assistant_chunk.embedding (migration assistant) ; l'application refuse un adaptateur qui ne
// la respecte pas. Adaptateurs : SDK configuré par variables d'environnement, et fixture
// déterministe par hachage de mots (tests, fonctionnement sans clé).

export const EMBEDDING_DIMENSIONS = 1024;

export interface EmbeddingProvider {
  /** Référence du modèle telle que configurée, ou « fixture ». Enregistrée avec chaque extrait. */
  readonly modelRef: string;
  readonly dimensions: number;
  /** Vecteurs dans l'ordre des textes, normalisés ou non (la recherche utilise le cosinus). */
  embed(values: readonly string[]): Promise<number[][]>;
}

export class EmbeddingProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "EmbeddingProviderError";
  }
}
