import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import type { LiveActivityItem } from "@/modules/live";

// Point qui pulse sur une carte à l'arrivée d'un fait en direct (relevé, signalement, alerte,
// feu), puis s'efface. Le marqueur est un élément HTML animé en CSS : aucune source ni couche à
// ajouter à la carte, et rien à nettoyer si la carte est détruite entre-temps.

export const PULSE_MS = 30_000;

const TONES: Record<string, string> = {
  field: "bg-forest",
  alert: "bg-laterite",
  neutral: "bg-info",
};

export function pulseTone(kind: string): keyof typeof TONES {
  if (kind === "fire.detected" || kind === "alert.raised") return "alert";
  if (kind.startsWith("farm.")) return "field";
  return "neutral";
}

function pulseElement(item: LiveActivityItem): HTMLElement {
  const color = TONES[pulseTone(item.kind)];
  const root = document.createElement("span");
  root.className = "relative flex size-4 pointer-events-none";
  root.setAttribute("aria-hidden", "true");
  root.dataset.liveId = item.id;
  const ring = document.createElement("span");
  ring.className = `absolute inline-flex size-full animate-ping rounded-full opacity-75 ${color}`;
  const dot = document.createElement("span");
  dot.className = `relative inline-flex size-4 rounded-full border-2 border-white ${color}`;
  root.append(ring, dot);
  return root;
}

/** Pose un point pulsant pour chaque fait localisé encore jamais montré sur cette carte. */
export function showLivePulses(
  map: MapLibreMap,
  items: readonly LiveActivityItem[],
  shown: Set<string>,
): void {
  for (const item of items) {
    if (!item.point || shown.has(item.id)) continue;
    shown.add(item.id);
    const marker = new Marker({ element: pulseElement(item) })
      .setLngLat([item.point.lng, item.point.lat])
      .addTo(map);
    setTimeout(() => marker.remove(), PULSE_MS);
  }
}
