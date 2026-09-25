import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Bénin Agricultural Intelligence System",
    short_name: "BAIS",
    description:
      "Plateforme nationale de connaissance, d'accompagnement et de pilotage de l'agriculture béninoise.",
    lang: "fr",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Fond blanc et marine de l'en-tête : icônes aux armoiries de l'État (scripts/generate-icons.mjs).
    background_color: "#ffffff",
    theme_color: "#0a3764",
    categories: ["government", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
