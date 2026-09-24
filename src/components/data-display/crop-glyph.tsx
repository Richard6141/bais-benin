import { cn } from "@/lib/utils";

import { CROP_GLYPH_PATHS } from "./crop-glyph-paths";

/**
 * Codes des 21 cultures de phase 1, alignés sur src/database/seed/reference/crops.ts. Le
 * référentiel les porte en `string` ; l'union est déclarée ici pour que l'absence d'un glyphe
 * soit une erreur de compilation et non un pictogramme vide à l'écran.
 */
export type CropCode =
  | "MAIZE"
  | "RICE"
  | "SORGHUM"
  | "MILLET"
  | "CASSAVA"
  | "YAM"
  | "SWEET_POTATO"
  | "COWPEA"
  | "GROUNDNUT"
  | "SOYBEAN"
  | "COTTON"
  | "CASHEW"
  | "PINEAPPLE"
  | "OIL_PALM"
  | "SHEA"
  | "SESAME"
  | "TOMATO"
  | "CHILI"
  | "OKRA"
  | "ONION"
  | "PLANTAIN";

/** Nom français de chaque culture, utilisé comme libellé accessible par défaut. */
export const CROP_GLYPH_LABELS: Record<CropCode, string> = {
  MAIZE: "Maïs",
  RICE: "Riz",
  SORGHUM: "Sorgho",
  MILLET: "Mil",
  CASSAVA: "Manioc",
  YAM: "Igname",
  SWEET_POTATO: "Patate douce",
  COWPEA: "Niébé",
  GROUNDNUT: "Arachide",
  SOYBEAN: "Soja",
  COTTON: "Coton",
  CASHEW: "Anacarde",
  PINEAPPLE: "Ananas",
  OIL_PALM: "Palmier à huile",
  SHEA: "Karité",
  SESAME: "Sésame",
  TOMATO: "Tomate",
  CHILI: "Piment",
  OKRA: "Gombo",
  ONION: "Oignon",
  PLANTAIN: "Banane plantain",
};

export const CROP_CODES = Object.keys(CROP_GLYPH_LABELS) as readonly CropCode[];

/** Deux tailles seulement (docs/07 §6) : 24 px en interface, 48 px sur l'espace agriculteur. */
type CropGlyphSize = 24 | 48;

const SIZE_CLASSES: Record<CropGlyphSize, string> = {
  24: "size-6",
  48: "size-12",
};

interface CropGlyphProps {
  code: CropCode;
  size?: CropGlyphSize;
  className?: string;
  /** Libellé accessible ; remplace le nom français, par exemple pour préciser une variété. */
  title?: string;
}

/**
 * Pictogramme de culture monochrome, repère visuel pour les utilisateurs peu lettrés. Le trait
 * suit `currentColor` : la couleur se pilote par la classe de texte du parent, comme une icône
 * Lucide, et le glyphe reste lisible en mode sombre sans variante dédiée.
 */
export function CropGlyph({ code, size = 24, className, title }: CropGlyphProps) {
  const Paths = CROP_GLYPH_PATHS[code];

  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label={title ?? CROP_GLYPH_LABELS[code]}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", SIZE_CLASSES[size], className)}
    >
      <Paths />
    </svg>
  );
}
