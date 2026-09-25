// Réduction d'une photo sur l'appareil avant de la mettre dans la file d'attente : un signalement
// doit pouvoir partir en 2G. Le passage par un canevas retire déjà les métadonnées (EXIF, position
// de l'appareil) ; le serveur réencode de toute façon (modules/reports/photo.ts).

export interface CompressedPhoto {
  contentType: "image/webp" | "image/jpeg";
  dataBase64: string;
  /** Aperçu affichable tout de suite dans le formulaire. */
  previewUrl: string;
}

// Doit rester sous la limite de la commande (FIELD_REPORT_PHOTO_MAX_BASE64, 400 000 caractères).
const MAX_BASE64 = 380_000;
const ATTEMPTS: readonly { edge: number; quality: number }[] = [
  { edge: 1280, quality: 0.75 },
  { edge: 1024, quality: 0.65 },
  { edge: 800, quality: 0.55 },
  { edge: 640, quality: 0.5 },
];

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Lecture de la photo impossible"));
    reader.readAsDataURL(blob);
  });
}

export async function compressPhoto(file: File): Promise<CompressedPhoto> {
  if (!file.type.startsWith("image/")) throw new Error("Ce fichier n'est pas une photo");
  // imageOrientation : la photo est redressée comme la montre le téléphone.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    for (const attempt of ATTEMPTS) {
      const scale = Math.min(1, attempt.edge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      // WebP si le navigateur sait l'écrire, sinon JPEG.
      let blob = await toBlob(canvas, "image/webp", attempt.quality);
      if (!blob || blob.type !== "image/webp")
        blob = await toBlob(canvas, "image/jpeg", attempt.quality);
      if (!blob) continue;
      const dataBase64 = await blobToBase64(blob);
      if (dataBase64.length <= MAX_BASE64) {
        return {
          contentType: blob.type === "image/webp" ? "image/webp" : "image/jpeg",
          dataBase64,
          previewUrl: URL.createObjectURL(blob),
        };
      }
    }
  } finally {
    bitmap.close();
  }
  throw new Error("Photo trop lourde, même réduite : reprenez-la de plus près");
}
