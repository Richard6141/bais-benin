import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { ingestCorpus, parseFiche, type CorpusIngestion, type Fiche } from "@/modules/assistant";
import { getAssistantProviders } from "@/modules/assistant/providers";

// Corpus de l'assistant : fiches Markdown de src/database/seed/assistant/corpus, chargées et
// indexées avec l'adaptateur de plongement configuré (démonstration sans configuration).
// Relancer après un changement de fiche ou de modèle de plongement : seules les fiches
// modifiées sont recalculées ; une fiche retirée du dossier est archivée.

export const CORPUS_DIR = path.join(
  process.cwd(),
  "src",
  "database",
  "seed",
  "assistant",
  "corpus",
);

export async function loadCorpus(dir = CORPUS_DIR): Promise<Fiche[]> {
  const entries = await readdir(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [] as string[];
    throw error;
  });
  const files = entries.filter((f) => f.endsWith(".md")).sort();
  return Promise.all(
    files.map(async (file) => parseFiche(await readFile(path.join(dir, file), "utf8"), file)),
  );
}

export async function seedAssistantCorpus(dir = CORPUS_DIR): Promise<CorpusIngestion> {
  const fiches = await loadCorpus(dir);
  return ingestCorpus(fiches, getAssistantProviders().embeddings, { archiveMissing: true });
}
