import type { GeoPosition } from "@/components/forms/location-picker";

// Un coin de parcelle se relève en restant immobile quelques secondes : plusieurs lectures GPS
// brutes sont moyennées plutôt qu'une seule prise, bruitée par le rebond du signal sous frondaison
// ou près d'un bâtiment. La précision retenue est celle, moyenne, des lectures qui composent le point.

export function averagePositions(samples: readonly GeoPosition[]): GeoPosition {
  if (samples.length === 0) throw new Error("Aucune lecture GPS à moyenner");
  const lat = samples.reduce((sum, s) => sum + s.lat, 0) / samples.length;
  const lng = samples.reduce((sum, s) => sum + s.lng, 0) / samples.length;
  const accuracies = samples.map((s) => s.accuracyM).filter((a): a is number => a !== undefined);
  const accuracyM =
    accuracies.length > 0
      ? accuracies.reduce((sum, a) => sum + a, 0) / accuracies.length
      : undefined;
  return { lat, lng, accuracyM };
}

export const CORNER_CAPTURE_DURATION_MS = 4_000;
export const MAX_SAMPLE_ACCURACY_M = 25;

/**
 * Écarte les lectures trop imprécises avant la moyenne. Si aucune ne passe le seuil, garde la
 * meilleure moitié : un point médiocre vaut mieux que pas de point, l'agent voit sa précision.
 */
export function keepPreciseSamples(
  samples: readonly GeoPosition[],
  maxAccuracyM = MAX_SAMPLE_ACCURACY_M,
): GeoPosition[] {
  const precise = samples.filter((s) => s.accuracyM === undefined || s.accuracyM <= maxAccuracyM);
  if (precise.length > 0) return precise;
  const ranked = [...samples].sort((a, b) => (a.accuracyM ?? Infinity) - (b.accuracyM ?? Infinity));
  return ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 2)));
}

export type CornerCaptureFunction = (
  onSample?: (sampleCount: number, accuracyM: number | undefined) => void,
) => Promise<GeoPosition>;

/** Moyenne les positions du navigateur pendant `durationMs`, puis résout avec le point moyen. */
export const browserCaptureCorner: CornerCaptureFunction = (onSample) =>
  new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject({ code: 2 });
      return;
    }
    const samples: GeoPosition[] = [];
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        samples.push({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyM: position.coords.accuracy,
        });
        onSample?.(samples.length, position.coords.accuracy);
      },
      (error) => {
        if (samples.length === 0) {
          navigator.geolocation.clearWatch(watchId);
          clearTimeout(timer);
          reject(error);
        }
      },
      { enableHighAccuracy: true, timeout: CORNER_CAPTURE_DURATION_MS + 2_000, maximumAge: 0 },
    );
    const timer = setTimeout(() => {
      navigator.geolocation.clearWatch(watchId);
      if (samples.length === 0) {
        reject({ code: 2 });
        return;
      }
      resolve(averagePositions(keepPreciseSamples(samples)));
    }, CORNER_CAPTURE_DURATION_MS);
  });
