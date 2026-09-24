import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

// Génère les icônes PWA à partir du monogramme vectoriel.
// Lancer : node scripts/generate-icons.mjs

const monogram = (padding) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="512" height="512">
  <rect width="40" height="40" fill="#0f4c5c"/>
  <g transform="translate(${padding} ${padding}) scale(${(40 - 2 * padding) / 40})">
    <rect x="2" y="2" width="36" height="36" rx="8" fill="#0f4c5c"/>
    <g stroke="rgba(246,243,238,0.35)" stroke-width="1">
      <path d="M14 2v36M26 2v36M2 14h36M2 26h36"/>
    </g>
    <path d="M8 30 L32 10" stroke="#b7410e" stroke-width="3.2" stroke-linecap="round"/>
    <circle cx="32" cy="10" r="3" fill="#f6f3ee"/>
  </g>
</svg>`;

await mkdir("public/icons", { recursive: true });

const outputs = [
  { file: "public/icons/icon-192.png", size: 192, padding: 0 },
  { file: "public/icons/icon-512.png", size: 512, padding: 0 },
  // L'icône maskable garde une marge de sécurité de 20 % pour les masques Android.
  { file: "public/icons/icon-maskable-512.png", size: 512, padding: 6 },
  { file: "public/icons/apple-touch-icon.png", size: 180, padding: 0 },
];

for (const { file, size, padding } of outputs) {
  const png = await sharp(Buffer.from(monogram(padding)))
    .resize(size, size)
    .png()
    .toBuffer();
  await writeFile(file, png);
  console.log(`${file} (${size}px)`);
}
