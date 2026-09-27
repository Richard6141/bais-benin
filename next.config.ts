import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

// C6 : origine du fond de carte MapLibre (ADR-0006), pour l'autoriser précisément dans la CSP
// plutôt que d'ouvrir img-src/connect-src en grand. Lu de la même variable que map-config.ts,
// avec le même repli, pour ne jamais diverger d'elle.
function mapTileOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/positron";
  try {
    return new URL(raw).origin;
  } catch {
    return "https://tiles.openfreemap.org";
  }
}

// Imagerie aérienne haute résolution, optionnelle (map-config.ts, HIRES_IMAGERY) : son origine
// n'est autorisée que si la variable est renseignée.
function hiresTileOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_HIRES_TILES_URL;
  if (!raw) return "";
  try {
    return ` ${new URL(raw.replace(/\{[^}]+\}/g, "0")).origin}`;
  } catch {
    return "";
  }
}

// Relief 3D, optionnel (map-config.ts, RELIEF) : tuiles d'élévation publiques par défaut
// (Terrain Tiles, sur S3), remplaçables par NEXT_PUBLIC_DEM_TILES_URL. Même repli qu'elle.
function demTileOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_DEM_TILES_URL ??
    "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
  try {
    return ` ${new URL(raw.replace(/\{[^}]+\}/g, "0")).origin}`;
  } catch {
    return "";
  }
}

const isDev = process.env.NODE_ENV !== "production";

// C6 : CSP raisonnable — pas de nonce par requête (next.config.ts n'a pas accès à une valeur
// par requête sans middleware dédié), mais chaque directive est restreinte à ce que
// l'application charge réellement : son origine, le fond de carte MapLibre configuré, et rien
// d'autre. object-src/frame-ancestors/base-uri/form-action verrouillés dans tous les cas.
// 'unsafe-eval' n'est ajouté qu'en développement (Turbopack/HMR en ont besoin ; jamais en
// production). Testé manuellement : la carte (tuiles vectorielles, style, worker MapLibre
// auto-hébergé) continue de fonctionner après ce durcissement (docs/rapports/etape-9-production.md).
function buildCsp(): string {
  const tileOrigin = `${mapTileOrigin()}${hiresTileOrigin()}${demTileOrigin()}`;
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${tileOrigin}`,
    "font-src 'self' data:",
    `connect-src 'self' ${tileOrigin}${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

// En-têtes de sécurité appliqués à toutes les réponses.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // La géolocalisation est réservée à l'espace agent (relevé de parcelles).
    value: "camera=(), microphone=(), geolocation=(self), payment=()",
  },
  { key: "Content-Security-Policy", value: buildCsp() },
  // Ignoré par les navigateurs tant que la réponse n'arrive pas en HTTPS (donc inoffensif en
  // développement) ; pas de "preload" — engagement irréversible hors du périmètre de cette étape.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Image autonome pour le conteneur Docker (voir docker/Dockerfile).
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  experimental: {
    // La génération statique par défaut lance un worker par cœur ; sur les postes
    // de développement modestes cela épuise la mémoire. Deux workers suffisent
    // pour le nombre de pages statiques de l'application.
    cpus: 2,
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default withSerwist(nextConfig);
