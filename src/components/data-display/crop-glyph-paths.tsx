/**
 * Tracés des pictogrammes de cultures, un composant court par glyphe.
 *
 * Chaque tracé vit dans une grille de 24 × 24 et hérite du trait défini par le `<svg>` parent
 * (monochrome, 1,75 px, extrémités arrondies). Les formes sont des silhouettes géométriques
 * volontairement abstraites (docs/07 §6) : un repère reconnaissable en un coup d'œil à 24 px pour
 * un utilisateur peu lettré, pas une illustration botanique. Chaque glyphe doit donc rester
 * distinct de ses voisins de catégorie (soja / sésame / mil, tomate / oignon / karité) par sa
 * silhouette et non par un détail fin qui disparaîtrait à petite taille.
 */

import type { CropCode } from "./crop-glyph";

function MaizeGlyph() {
  // Épi ovale hachuré porté par un faisceau de trois traits.
  return (
    <>
      <ellipse cx="12" cy="8" rx="4" ry="6" />
      <path d="M9 5h6M8 8h8M9 11h6" />
      <path d="M12 14v8M9 14l-3 8M15 14l3 8" />
    </>
  );
}

function RiceGlyph() {
  // Tige souple dont la tête, alourdie, retombe ; les grains pendent sous la courbe.
  return (
    <>
      <path d="M5 22C5 14 8 10 12 7" />
      <path d="M12 7c3-2 6-1 8 2" />
      <path d="M13 8v3M16 7v3M19 9v3" />
    </>
  );
}

function SorghumGlyph() {
  // Tête conique dense sur une tige droite.
  return (
    <>
      <path d="M12 2l5 10H7Z" />
      <path d="M9.5 7h5M8 10h8" />
      <path d="M12 12v10" />
    </>
  );
}

function MilletGlyph() {
  // Chandelle étroite et cylindrique, plus fine que la tête de sorgho.
  return (
    <>
      <rect x="9.5" y="2" width="5" height="12" rx="2.5" />
      <path d="M9.5 6h5M9.5 10h5" />
      <path d="M12 14v8" />
    </>
  );
}

function CassavaGlyph() {
  // Trois tubercules allongés partant d'un même nœud.
  return (
    <>
      <path d="M12 3v3" />
      <path d="M12 6C8 9 6 14 7 21M12 6v15M12 6c4 3 6 8 5 15" />
    </>
  );
}

function YamGlyph() {
  // Fuseau vertical, la forme la plus simple de l'igname.
  return (
    <>
      <path d="M12 2c5 6 5 14 0 20c-5-6-5-14 0-20Z" />
      <path d="M12 7v10" />
    </>
  );
}

function SweetPotatoGlyph() {
  // Fuseau couché, incliné, pour ne pas se confondre avec l'igname.
  return (
    <>
      <path d="M3 15c3-8 14-11 18-6c-3 8-14 11-18 6Z" />
      <path d="M8 13l1 1M15 10l1 1" />
    </>
  );
}

function CowpeaGlyph() {
  // Gousse horizontale et quatre graines alignées.
  return (
    <>
      <path d="M3 12c3-7 15-7 18 0c-3 7-15 7-18 0Z" />
      <circle cx="7" cy="12" r="1.4" />
      <circle cx="10.5" cy="12" r="1.4" />
      <circle cx="14" cy="12" r="1.4" />
      <circle cx="17.5" cy="12" r="1.4" />
    </>
  );
}

function GroundnutGlyph() {
  // Coque étranglée en son milieu, hachurée.
  return (
    <>
      <path d="M11 3c-6 0-6 7-2 9c-4 2-4 9 2 9c5 0 6-6 3-9c3-3 2-9-3-9Z" />
      <path d="M8 8h5M8 16h5" />
    </>
  );
}

function SoybeanGlyph() {
  // Gousse verticale bombée et trois graines rondes.
  return (
    <>
      <path d="M12 2c6 3 6 17 0 20c-6-3-6-17 0-20Z" />
      <circle cx="12" cy="7" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="17" r="1.6" />
    </>
  );
}

function CottonGlyph() {
  // Trois cercles en grappe sur une courte tige : la capsule ouverte.
  return (
    <>
      <circle cx="12" cy="7" r="4" />
      <circle cx="7.5" cy="14" r="4" />
      <circle cx="16.5" cy="14" r="4" />
      <path d="M12 18v4" />
    </>
  );
}

function CashewGlyph() {
  // Pomme large au-dessus, noix en rein accrochée en dessous : la silhouette propre à l'anacarde.
  return (
    <>
      <path d="M12 2c4 0 6 4 5 8c-1 3-3 4-5 4c-2 0-4-1-5-4c-1-4 1-8 5-8Z" />
      <path d="M9 15c0 4 3 7 7 6c2-1 2-3 0-4c-2 0-4-1-5-3c-1 0-2 0-2 1Z" />
    </>
  );
}

function PineappleGlyph() {
  // Losange couronné, écailles suggérées par deux diagonales.
  return (
    <>
      <path d="M12 8l6 7l-6 7l-6-7Z" />
      <path d="M9 12l6 6M15 12l-6 6" />
      <path d="M12 8V2M12 8L8 3M12 8l4-5" />
    </>
  );
}

function OilPalmGlyph() {
  // Stipe droit et cinq palmes en éventail.
  return (
    <>
      <path d="M12 22V10" />
      <path d="M12 10C8 10 5 7 4 3M12 10c4 0 7-3 8-7M12 10c-2-4-2-6 0-8M12 10c-3-2-7-1-9 2M12 10c3-2 7-1 9 2" />
    </>
  );
}

function SheaGlyph() {
  // Fruit rond coiffé d'une calotte, tenu par une courte tige.
  return (
    <>
      <circle cx="12" cy="14" r="6" />
      <path d="M7 10c2-5 8-5 10 0" />
      <path d="M12 6V3" />
    </>
  );
}

function SesameGlyph() {
  // Tige droite et capsules dressées par paires à chaque nœud, en chevrons.
  return (
    <>
      <path d="M12 22V2" />
      <path d="M12 8l-4-4M12 8l4-4M12 13l-4-4M12 13l4-4M12 18l-4-4M12 18l4-4" />
    </>
  );
}

function TomatoGlyph() {
  // Cercle plein et calice à trois pointes.
  return (
    <>
      <circle cx="12" cy="14" r="7" />
      <path d="M12 7V3M12 7L8 5M12 7l4-2" />
    </>
  );
}

function ChiliGlyph() {
  // Cosse ventrue près du pédoncule, effilée et courbée vers la pointe.
  return (
    <>
      <path d="M15 4c4 1 4 6 2 10c-2 4-7 7-12 8c3-3 5-6 6-10c0-4 1-7 4-8Z" />
      <path d="M15 4c0-2 2-3 4-2" />
    </>
  );
}

function OkraGlyph() {
  // Cosse à côtes, effilée vers le bas, sous un chapeau plat.
  return (
    <>
      <path d="M8 3h8" />
      <path d="M9 3h6l-1 17l-2 2l-2-2Z" />
      <path d="M11 6v13M13 6v13" />
    </>
  );
}

function OnionGlyph() {
  // Bulbe en goutte, nervures internes convergeant vers la base.
  return (
    <>
      <path d="M12 21c-7 0-8-9-3-12c2-1 2-4 3-6c1 2 1 5 3 6c5 3 4 12-3 12Z" />
      <path d="M9 9c1 4 1 8 3 12M15 9c-1 4-1 8-3 12" />
    </>
  );
}

function PlantainGlyph() {
  // Régime de trois doigts courbés suspendus à une hampe.
  return (
    <>
      <path d="M4 7l9-4" />
      <path d="M6 6c0 8 4 13 10 14M9 5c0 8 4 12 10 13M12 3c0 7 4 12 9 12" />
    </>
  );
}

export const CROP_GLYPH_PATHS: Record<CropCode, () => React.JSX.Element> = {
  MAIZE: MaizeGlyph,
  RICE: RiceGlyph,
  SORGHUM: SorghumGlyph,
  MILLET: MilletGlyph,
  CASSAVA: CassavaGlyph,
  YAM: YamGlyph,
  SWEET_POTATO: SweetPotatoGlyph,
  COWPEA: CowpeaGlyph,
  GROUNDNUT: GroundnutGlyph,
  SOYBEAN: SoybeanGlyph,
  COTTON: CottonGlyph,
  CASHEW: CashewGlyph,
  PINEAPPLE: PineappleGlyph,
  OIL_PALM: OilPalmGlyph,
  SHEA: SheaGlyph,
  SESAME: SesameGlyph,
  TOMATO: TomatoGlyph,
  CHILI: ChiliGlyph,
  OKRA: OkraGlyph,
  ONION: OnionGlyph,
  PLANTAIN: PlantainGlyph,
};
