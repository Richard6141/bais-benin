import sharp from "sharp";

// Photo d'un signalement : l'appareil l'envoie déjà réduite, le serveur la réencode quand même.
// Le réencodage applique l'orientation de l'appareil puis ne garde aucune métadonnée (EXIF, XMP,
// position GPS de l'appareil, modèle du téléphone) : sharp n'en recopie aucune sans demande
// explicite. Toute image illisible, trop lourde ou trop grande est refusée.

export const REPORT_PHOTO_MAX_INPUT_BYTES = 300 * 1024;
export const REPORT_PHOTO_MAX_EDGE = 1280;

export interface PreparedPhoto {
  contentType: "image/webp";
  width: number;
  height: number;
  bytes: Uint8Array<ArrayBuffer>;
}

export async function prepareReportPhoto(base64: string): Promise<PreparedPhoto | null> {
  const input = Buffer.from(base64, "base64");
  if (input.length === 0 || input.length > REPORT_PHOTO_MAX_INPUT_BYTES) return null;
  try {
    // JPEG ou WebP seulement, ce que produit l'appareil : jamais de SVG, de TIFF ni de PDF, que
    // sharp saurait aussi décoder. 25 millions de pixels au plus avant décodage complet.
    const format = (await sharp(input).metadata()).format;
    if (format !== "jpeg" && format !== "webp") return null;
    const { data, info } = await sharp(input, { limitInputPixels: 25_000_000, failOn: "error" })
      .rotate()
      .resize({
        width: REPORT_PHOTO_MAX_EDGE,
        height: REPORT_PHOTO_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 75 })
      .toBuffer({ resolveWithObject: true });
    return {
      contentType: "image/webp",
      width: info.width,
      height: info.height,
      bytes: Uint8Array.from(data),
    };
  } catch {
    return null;
  }
}
