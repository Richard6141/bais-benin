import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

// En-têtes de sécurité appliqués à toutes les réponses. La CSP complète (avec nonces)
// arrive avec l'étape d'authentification ; on pose dès maintenant les protections
// qui ne dépendent pas du contenu des pages.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // La géolocalisation est réservée à l'espace agent (relevé de parcelles).
    value: "camera=(), microphone=(), geolocation=(self), payment=()",
  },
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
