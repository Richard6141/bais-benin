// Photographies de l'accueil. Les fichiers viennent de public/images (banque d'images
// libres de droits, crédits dans docs/credits-images.md et public/images/manifest.json).
// Les textes alternatifs décrivent la scène, pas la fonction de l'image.

export interface Photo {
  src: string;
  width: number;
  height: number;
  alt: string;
}

const photo = (name: string, width: number, height: number, alt: string): Photo => ({
  src: `/images/${name}-1600.webp`,
  width,
  height,
  alt,
});

export const landingPhotos = {
  hero: photo(
    "productrices-retour-champ-savalou",
    1600,
    1067,
    "Productrices rentrant du champ sur une piste de latérite, bassines sur la tête, collines de Savalou en arrière-plan",
  ),
  maize: photo(
    "champ-mais-manioc-oueme",
    1600,
    900,
    "Champ de maïs et de manioc dans la vallée de l'Ouémé sous un ciel chargé",
  ),
  yam: photo(
    "buttes-igname-atacora",
    1600,
    1067,
    "Buttes d'igname fraîchement montées dans l'Atacora",
  ),
  cassava: photo(
    "producteur-recolte-manioc",
    1600,
    1200,
    "Producteur tenant des racines de manioc fraîchement arrachées",
  ),
  rice: photo(
    "riziere-bas-fond-benin",
    1600,
    1200,
    "Rizière de bas-fond vert tendre, arbres isolés à l'horizon",
  ),
  market: photo(
    "etal-vivriers-porto-novo",
    1600,
    1067,
    "Étal de tomates et de produits vivriers sous un abri de marché à Porto-Novo",
  ),
  warehouse: photo(
    "rizerie-malanville-entrepot",
    1600,
    1200,
    "Camion chargé devant l'entrepôt de la rizerie de Malanville",
  ),
  cotton: photo(
    "recolte-coton-atacora",
    1600,
    1067,
    "Balle de coton récolté stockée en plein air dans l'Atacora",
  ),
  cashew: photo("fruit-anacarde-benin", 1600, 2133, "Pomme et noix de cajou mûres sur l'arbre"),
  gari: photo("sacs-gari-savalou", 1600, 1067, "Sacs de gari alignés devant une maison à Savalou"),
  pineapple: photo("champ-ananas-tori", 1600, 1200, "Champ d'ananas à Tori, palmiers au loin"),
  savanna: photo(
    "savane-baobabs-atacora",
    1600,
    1067,
    "Savane de l'Atacora en saison sèche, baobabs et herbes jaunies",
  ),
  aerial: photo(
    "vue-aerienne-parcelles-fsa",
    1600,
    900,
    "Vue aérienne d'un parcellaire agricole, bandes cultivées et chemins de terre",
  ),
  irrigation: photo(
    "maraichage-irrigue-grand-popo",
    1600,
    1067,
    "Planches de carottes irriguées sur le littoral de Grand-Popo",
  ),
} as const;

export type LandingPhotoKey = keyof typeof landingPhotos;
