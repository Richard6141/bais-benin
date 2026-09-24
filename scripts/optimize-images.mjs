import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

// Banque d'images de l'interface : télécharge les originaux depuis Wikimedia Commons, les
// convertit en WebP à deux largeurs et régénère public/images/manifest.json.
// Lancer : node scripts/optimize-images.mjs
//
// Les originaux (3 à 17 Mo chacun) ne sont jamais versionnés : ils sont mis en cache dans le
// dossier temporaire du système et retéléchargés au besoin. Seuls les WebP et le manifeste entrent
// dans le dépôt. Les crédits et licences sont documentés dans docs/credits-images.md ; toute
// image ajoutée ici doit y être ajoutée aussi.

const OUTPUT_DIR = "public/images";
const CACHE_DIR = join(tmpdir(), "bais-images-originals");
// Wikimedia exige un User-Agent identifiable ; une requête anonyme est refusée (403).
const USER_AGENT = "BAIS-image-bank/1.0 (plateforme agricole ; contact via le dépôt)";

// Deux largeurs : 1600 px pour les bandeaux et les fonds de section, 800 px pour les cartes, les
// vignettes et les écrans mobiles. Qualité 80 : sous ce seuil, les feuillages fourmillent.
const WIDTHS = [1600, 800];
const QUALITY = 80;
// Plafond par fichier à 1600 px : au-delà, la qualité est abaissée par paliers.
const MAX_BYTES_1600 = 250 * 1024;

/**
 * Catalogue des images. `source` est le titre exact du fichier sur Commons ; le script en déduit
 * l'adresse de l'original. `alt` est le texte alternatif français, descriptif et sans « photo de ».
 */
const CATALOG = [
  {
    slug: "champ-mais-manioc-oueme",
    source: "Champ de cultures dans l'Ouémé au Bénin.jpg",
    alt: "Champ de maïs et de manioc en association dans l'Ouémé, sous un ciel voilé",
    credit: "Photo : Fawaz.tairou, Wikimedia Commons, CC BY-SA 4.0",
    license: "CC BY-SA 4.0",
    tags: ["mais", "manioc", "oueme", "sud", "hero", "paysage"],
  },
  {
    slug: "recolte-coton-atacora",
    source: "Bénin-Récolte de coton (2).jpg",
    alt: "Coton-graine récolté, entassé dans un enclos de nattes au pied d'un baobab, nord-ouest du Bénin",
    credit: "Photo : Ji-Elle, Wikimedia Commons, CC BY-SA 4.0",
    license: "CC BY-SA 4.0",
    tags: ["coton", "recolte", "atacora", "nord", "stock"],
  },
  {
    slug: "buttes-igname-atacora",
    source: "Atakora-Culture de l'igname (4).jpg",
    alt: "Buttes d'igname fraîchement montées dans un champ de l'Atacora, arbres de savane en arrière-plan",
    credit: "Photo : Ji-Elle, Wikimedia Commons, CC BY-SA 4.0",
    license: "CC BY-SA 4.0",
    tags: ["igname", "tubercule", "atacora", "nord", "semis"],
  },
  {
    slug: "riziere-bas-fond-benin",
    source: "Rice in Benin - panoramio - Africa Rice Center (5).jpg",
    alt: "Rizière de bas-fond en pleine végétation, deux baobabs à l'horizon",
    credit: "Photo : Africa Rice Center, Wikimedia Commons, CC BY-SA 3.0",
    license: "CC BY-SA 3.0",
    tags: ["riz", "bas-fond", "riziere", "hero", "paysage"],
  },
  {
    slug: "champ-ananas-tori",
    source: "Culture de l'ananas dans l'arrondissement de Tori-Azohoue-Cada.jpg",
    alt: "Champ d'ananas à Tori-Azohoué-Cada sous un ciel chargé de nuages, palmiers à l'horizon",
    credit: "Photo : Saliousoft, Wikimedia Commons, CC BY-SA 4.0",
    license: "CC BY-SA 4.0",
    tags: ["ananas", "atlantique", "sud", "ciel", "orage"],
  },
  {
    slug: "fruit-anacarde-benin",
    source: "Fruit d'acajou sur un arbre au Bénin.jpg",
    alt: "Pommes de cajou rouge et jaune avec leurs noix, sur l'arbre",
    credit: "Photo : Saogou, Wikimedia Commons, CC BY-SA 4.0",
    license: "CC BY-SA 4.0",
    tags: ["anacarde", "cajou", "rente", "portrait", "gros-plan"],
  },
  {
    slug: "etal-vivriers-porto-novo",
    source: "Etalage de produits vivriers.jpg",
    alt: "Étal de tomates et de piments sous un abri de bambou au marché de Kpintoukpinmédé, Porto-Novo",
    credit: "Photo : Ksperentos, Wikimedia Commons, CC BY-SA 4.0",
    license: "CC BY-SA 4.0",
    tags: ["marche", "tomate", "piment", "vivrier", "oueme", "porto-novo"],
  },
  {
    slug: "productrices-retour-champ-savalou",
    source: "The cliché of equality!.jpg",
    alt: "Femmes et enfants de dos, bassines de légumes et fagots sur la tête, sur une piste de latérite à Savalou",
    credit: "Photo : Gbetongninougbo Joseph Hervé Ahissou, Wikimedia Commons, CC BY-SA 4.0",
    license: "CC BY-SA 4.0",
    tags: ["femmes", "productrices", "collines", "savalou", "transport", "hero"],
  },
  {
    slug: "producteur-recolte-manioc",
    source: "Récolte de tubercules de manioc 01.jpg",
    alt: "Producteur tenant un pied de manioc fraîchement arraché, tubercules apparents, mains et vêtements de travail",
    credit: "Photo : Mhope2010, Wikimedia Commons, CC BY-SA 4.0",
    license: "CC BY-SA 4.0",
    tags: ["manioc", "recolte", "producteur", "terrain"],
  },
  {
    slug: "sacs-gari-savalou",
    source: "Bénin-Vente de sacs de gari (1).jpg",
    alt: "Sacs de gari alignés sur des tréteaux au bord de la route, région de Savalou",
    credit: "Photo : Ji-Elle, Wikimedia Commons, CC BY-SA 4.0",
    license: "CC BY-SA 4.0",
    tags: ["gari", "manioc", "vente", "collines", "stock", "cooperative"],
  },
  {
    slug: "rizerie-malanville-entrepot",
    source: "Riziere in Malanville - Rice milling factory in Malanville - panoramio.jpg",
    alt: "Rizerie de Malanville : hangar industriel, camion bâché et tracteur devant l'entrée",
    credit: "Photo : Africa Rice Center, Wikimedia Commons, CC BY-SA 3.0",
    license: "CC BY-SA 3.0",
    tags: ["riz", "entrepot", "transformation", "alibori", "nord", "logistique"],
  },
  {
    slug: "savane-baobabs-atacora",
    source: "Baobabs et rôniers au pied de l'Atacora.jpg",
    alt: "Savane en saison sèche au pied de l'Atacora : grand baobab défeuillé, rôniers, chèvre et greniers de village",
    credit: "Photo : Ji-Elle, Wikimedia Commons, CC BY-SA 4.0",
    license: "CC BY-SA 4.0",
    tags: ["savane", "atacora", "nord", "saison-seche", "paysage"],
  },
  {
    slug: "vue-aerienne-parcelles-fsa",
    source: "Vue du ciel d'une ferme de la FSA.jpg",
    alt: "Vue aérienne de parcelles maraîchères rectangulaires et de personnes au travail sur une planche de culture",
    credit: "Photo : Fawaz.tairou, Wikimedia Commons, CC BY-SA 4.0",
    license: "CC BY-SA 4.0",
    tags: ["aerien", "parcelles", "maraichage", "abomey-calavi", "cartographie"],
  },
  {
    slug: "maraichage-irrigue-grand-popo",
    source: "Carrot field Grand Popo Benin.jpg",
    alt: "Planches de carottes irriguées au goutte-à-goutte à Grand-Popo, cocotiers en arrière-plan",
    credit: "Photo : Kulttuurinavigaattori, Wikimedia Commons, CC BY-SA 4.0",
    license: "CC BY-SA 4.0",
    tags: ["maraichage", "irrigation", "carotte", "mono", "sud"],
  },
];

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} pour ${url}`);
  return response.json();
}

// Résout l'adresse de l'original via l'API plutôt que de la reconstituer : le chemin de stockage
// dépend d'un condensé MD5 du nom de fichier et changerait au moindre renommage.
async function resolveOriginal(title) {
  const api = new URL("https://commons.wikimedia.org/w/api.php");
  api.searchParams.set("action", "query");
  api.searchParams.set("format", "json");
  api.searchParams.set("titles", `File:${title}`);
  api.searchParams.set("prop", "imageinfo");
  api.searchParams.set("iiprop", "url|sha1");
  // descriptionurl : page de description du fichier, citée comme source dans le manifeste.
  const data = await fetchJson(api);
  const page = Object.values(data.query.pages)[0];
  const info = page?.imageinfo?.[0];
  if (!info) throw new Error(`Fichier introuvable sur Commons : ${title}`);
  return { url: info.url, sha1: info.sha1, page: info.descriptionurl };
}

async function downloadOriginal(entry) {
  const { url, sha1, page } = await resolveOriginal(entry.source);
  const cached = join(CACHE_DIR, `${entry.slug}-${sha1}.jpg`);
  try {
    await stat(cached);
    return { cached, page };
  } catch {
    // Absent du cache : on télécharge.
  }
  await writeFile(cached, await fetchWithRetry(url));
  return { cached, page };
}

// Commons limite le débit des téléchargements d'originaux (HTTP 429) : on attend le délai
// annoncé par Retry-After, sinon un délai croissant, avant de réessayer.
async function fetchWithRetry(url, attempts = 5) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    if (response.status !== 429 || attempt === attempts) {
      throw new Error(`${response.status} pour ${url}`);
    }
    const retryAfter = Number(response.headers.get("retry-after")) || attempt * 5;
    console.log(`  débit limité par Commons, nouvel essai dans ${retryAfter} s`);
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
  }
  throw new Error(`Téléchargement impossible : ${url}`);
}

// Les textures très fines (sol labouré, feuillage sec) résistent à la compression : un léger
// adoucissement, imperceptible sur un fond de section, fait perdre plus d'octets qu'une baisse de
// qualité. Paliers en sigma de flou gaussien ; 0 = image nette.
const SOFTEN_LEVELS = [0, 0.6, 1.2];

async function encode(input, width, quality, soften = 0) {
  let pipeline = sharp(input)
    .rotate() // applique l'orientation EXIF avant de la retirer avec les métadonnées
    .resize({ width, withoutEnlargement: true });
  if (soften > 0) pipeline = pipeline.blur(soften);
  return pipeline.webp({ quality, effort: 6 }).toBuffer({ resolveWithObject: true });
}

// Descend la qualité par paliers de 5 jusqu'à passer sous le plafond, puis adoucit si besoin.
async function encodeWithinBudget(source, width) {
  for (const soften of SOFTEN_LEVELS) {
    for (let quality = QUALITY; quality >= 60; quality -= 5) {
      const result = await encode(source, width, quality, soften);
      if (width !== 1600 || result.data.length <= MAX_BYTES_1600) {
        return { result, quality, soften };
      }
    }
  }
  throw new Error(`Impossible de tenir ${MAX_BYTES_1600} octets à ${width} px`);
}

async function processEntry(entry) {
  const { cached, page } = await downloadOriginal(entry);
  const source = await readFile(cached);
  const variants = [];
  for (const width of WIDTHS) {
    const { result, quality, soften } = await encodeWithinBudget(source, width);
    const file = `${entry.slug}-${width}.webp`;
    await writeFile(join(OUTPUT_DIR, file), result.data);
    variants.push({
      file,
      width: result.info.width,
      height: result.info.height,
      bytes: result.data.length,
      quality,
    });
    console.log(
      `${file}  ${result.info.width}x${result.info.height}  ${Math.round(result.data.length / 1024)} Ko  q${quality}${soften ? ` adouci ${soften}` : ""}`,
    );
  }
  return { variants, page };
}

await mkdir(OUTPUT_DIR, { recursive: true });
await mkdir(CACHE_DIR, { recursive: true });

const images = [];
for (const entry of CATALOG) {
  const { variants, page } = await processEntry(entry);
  const large = variants.find((variant) => variant.width > 800) ?? variants[0];
  images.push({
    id: entry.slug,
    file: large.file,
    alt: entry.alt,
    width: large.width,
    height: large.height,
    credit: entry.credit,
    license: entry.license,
    source: page,
    tags: entry.tags,
    variants: variants.map(({ file, width, height }) => ({ file, width, height })),
  });
}

await writeFile(join(OUTPUT_DIR, "manifest.json"), `${JSON.stringify({ images }, null, 2)}\n`);
console.log(`\n${images.length} images, manifeste écrit dans ${OUTPUT_DIR}/manifest.json`);
