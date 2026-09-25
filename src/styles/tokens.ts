// Jetons de couleur consommés en JavaScript : cartes MapLibre, graphiques,
// exports PNG. Les valeurs sont identiques à tokens.css ; ce fichier existe
// parce que ces bibliothèques ne lisent pas les variables CSS.

export const brandColors = {
  ink: "#1d2530",
  marine: "#0a3764",
  marineStrong: "#082b4f",
  marineSoft: "#e8eef6",
  gulf: "#0f4c5c",
  gulfStrong: "#0a3642",
  laterite: "#b7410e",
  forest: "#1f5a3c",
  chalk: "#f5f7fa",
  paper: "#ffffff",
} as const;

export const semanticColors = {
  info: "#1e5a8a",
  success: "#287d3c",
  watch: "#b7791f",
  warning: "#b7410e",
  critical: "#8b1e2d",
  offline: "#5b5f66",
} as const;

// Échelle séquentielle (densité, hectares, production) : 7 paliers, du plus clair au plus dense.
export const sequentialScale = [
  "#e9efea",
  "#c9dbd8",
  "#a4c4c6",
  "#7cabb2",
  "#52909c",
  "#2f6e7c",
  "#0f4c5c",
] as const;

// Échelle de la carte agricole : sept classes, chacune d'une teinte franchement différente de sa
// voisine (jaune, vert clair, émeraude, bleu céruléen, bleu roi, violet, lie-de-vin), pour
// distinguer chaque zone d'un coup d'œil. La clarté baisse d'une classe à l'autre, du plus faible
// au plus fort, pour que les seuils de la légende se lisent encore dans l'ordre, y compris pour
// les daltoniens et en impression en niveaux de gris. Ni rouge ni orange : ils sont réservés aux
// alertes.
export const choroplethScale = [
  "#fde355",
  "#82df67",
  "#12b886",
  "#1596b8",
  "#2f5fc4",
  "#7a3fb0",
  "#8a0a4f",
] as const;

// Couleur des communes sans donnée ou masquées (secret statistique) : gris neutre, hors échelle.
export const choroplethNoData = "#e5e9ee";

// Échelle divergente (écart à la normale) : latérite pour le déficit, golfe pour l'excédent.
export const divergingScale = [
  "#b7410e",
  "#d3814f",
  "#e9bb9a",
  "#f6f3ee",
  "#a4c4c6",
  "#52909c",
  "#0f4c5c",
] as const;

// Couleurs fixes des cultures majeures dans tout le produit, pour créer une mémoire visuelle.
// Choisies pour rester distinctes en deutéranopie et protanopie.
export const cropColors = {
  MAIZE: "#c99a2e",
  COTTON: "#5b7fa3",
  CASSAVA: "#8c6d4f",
  YAM: "#a3532b",
  RICE: "#4f8a5b",
  SORGHUM: "#8b3a3a",
  MILLET: "#b58b4c",
  COWPEA: "#6f5b8f",
  GROUNDNUT: "#c17b4a",
  SOYBEAN: "#7a9a3b",
  CASHEW: "#c2543f",
  PINEAPPLE: "#d5a021",
} as const;

export type CropColorCode = keyof typeof cropColors;

export const reliabilityColors = {
  DECLARED: "#a9a196",
  AGENT_VERIFIED: "#52909c",
  FIELD_VERIFIED: "#0f4c5c",
  OFFICIAL: "#1f5a3c",
  ESTIMATED: "#b7791f",
  SYNTHETIC: "#7d766d",
} as const;

export type ReliabilityLevel = keyof typeof reliabilityColors;
