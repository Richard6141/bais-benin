import { createHash } from "node:crypto";
import { z } from "zod";

// Fiches techniques du corpus de l'assistant : format, lecture et découpage en extraits.
// Une fiche est un fichier Markdown précédé d'un en-tête JSON entre deux lignes « --- ».
// L'en-tête porte la source vérifiée (organisme, titre, adresse, licence, date de vérification)
// et les étiquettes de recherche ; le corps est découpé par section « ## ».

export const ficheMetaSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug en minuscules et tirets"),
  title: z.string().min(5),
  crops: z.array(z.string().regex(/^[A-Z_]+$/)).default([]),
  zones: z.array(z.string()).default([]),
  topics: z.array(z.string()).min(1),
  alertCategories: z
    .array(z.enum(["WATER_STRESS", "FLOOD", "HEAT", "PEST", "MARKET", "ADMIN"]))
    .default([]),
  /** Vrai pour une fiche rédigée par l'équipe (synthèse de la source citée). */
  demonstration: z.boolean(),
  source: z.object({
    organization: z.string().min(2),
    title: z.string().min(3),
    url: z.url(),
    licence: z.string().min(3),
    published: z.string().nullable().default(null),
    /** Date (AAAA-MM-JJ) à laquelle l'adresse et la licence ont été vérifiées en ligne. */
    checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  reviewedBy: z.string().nullable().default(null),
});

export type FicheMeta = z.infer<typeof ficheMetaSchema>;

export interface Fiche {
  meta: FicheMeta;
  body: string;
  contentHash: string;
}

export interface FicheChunk {
  ordinal: number;
  heading: string;
  content: string;
  tokenCount: number;
  contentHash: string;
}

export const CHUNK_MAX_CHARS = 2200;

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function parseFiche(text: string, file = "fiche"): Fiche {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text.replace(/^﻿/, ""));
  if (!match) throw new Error(`${file} : en-tête « --- » introuvable`);
  let raw: unknown;
  try {
    raw = JSON.parse(match[1]!);
  } catch {
    throw new Error(`${file} : en-tête JSON illisible`);
  }
  const parsed = ficheMetaSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(" ; ");
    throw new Error(`${file} : en-tête invalide (${issues})`);
  }
  const body = match[2]!.trim();
  return {
    meta: parsed.data,
    body,
    contentHash: sha256(`${JSON.stringify(parsed.data)}\n${body}`),
  };
}

/** Estimation du nombre de jetons d'un texte français (environ quatre caractères par jeton). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Paragraphes regroupés en morceaux d'au plus `max` caractères, un paragraphe de recouvrement. */
function splitLong(paragraphs: string[], max: number): string[] {
  const parts: string[] = [];
  let current: string[] = [];
  for (const paragraph of paragraphs) {
    const candidate = [...current, paragraph].join("\n\n");
    if (current.length > 0 && candidate.length > max) {
      parts.push(current.join("\n\n"));
      current = [current.at(-1)!, paragraph];
    } else {
      current.push(paragraph);
    }
  }
  if (current.length > 0) parts.push(current.join("\n\n"));
  return parts;
}

// Un extrait par section « ## » ; une section trop longue est coupée entre paragraphes. Le texte
// avant la première section (introduction) forme le premier extrait. Chaque extrait est préfixé
// du titre de la fiche et de la section, pour être compris seul.
export function chunkFiche(fiche: Fiche, max = CHUNK_MAX_CHARS): FicheChunk[] {
  const sections: Array<{ heading: string; text: string }> = [];
  let heading = "Présentation";
  let lines: string[] = [];
  const flush = () => {
    const text = lines.join("\n").trim();
    if (text) sections.push({ heading, text });
  };
  for (const line of fiche.body.split(/\r?\n/)) {
    const h = /^##\s+(.+)$/.exec(line);
    if (h) {
      flush();
      heading = h[1]!.trim();
      lines = [];
    } else if (!/^#\s/.test(line)) {
      lines.push(line);
    }
  }
  flush();

  const chunks: FicheChunk[] = [];
  for (const section of sections) {
    const paragraphs = section.text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const part of splitLong(paragraphs, max)) {
      const content = part;
      chunks.push({
        ordinal: chunks.length,
        heading: `${fiche.meta.title} — ${section.heading}`,
        content,
        tokenCount: estimateTokens(content),
        contentHash: sha256(`${section.heading}\n${content}`),
      });
    }
  }
  return chunks;
}

/** Texte envoyé au modèle de plongement : intitulé et contenu, pour ancrer l'extrait. */
export function embeddingText(chunk: Pick<FicheChunk, "heading" | "content">): string {
  return `${chunk.heading}\n${chunk.content}`;
}
