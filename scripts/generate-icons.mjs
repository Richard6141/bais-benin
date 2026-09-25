import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

// Génère les icônes de l'application installée et de l'onglet à partir des armoiries de l'État
// (public/images/logos/maep-benin.png) : la plateforme ne porte que l'identité du ministère.
// Armoiries centrées sur fond blanc, avec une marge ; marge élargie pour l'icône « maskable ».
// Lancer : node scripts/generate-icons.mjs

const SOURCE = "public/images/logos/maep-benin.png";

async function icon(size, marginRatio) {
  const inner = Math.round(size * (1 - 2 * marginRatio));
  const emblem = await sharp(SOURCE)
    .resize(inner, inner, { fit: "contain", background: "#ffffff", kernel: "lanczos3" })
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 3, background: "#ffffff" },
  })
    .composite([{ input: emblem, gravity: "center" }])
    .png()
    .toBuffer();
}

await mkdir("public/icons", { recursive: true });

const outputs = [
  { file: "public/icons/icon-192.png", size: 192, margin: 0.06 },
  { file: "public/icons/icon-512.png", size: 512, margin: 0.06 },
  // L'icône maskable garde une zone de sécurité de 20 % pour les masques Android.
  { file: "public/icons/icon-maskable-512.png", size: 512, margin: 0.2 },
  { file: "public/icons/apple-touch-icon.png", size: 180, margin: 0.08 },
  // Icône d'onglet, servie par la convention de fichiers de Next (src/app/icon.png).
  { file: "src/app/icon.png", size: 64, margin: 0.04 },
];

for (const { file, size, margin } of outputs) {
  await writeFile(file, await icon(size, margin));
  console.log(`${file} (${size}px)`);
}
