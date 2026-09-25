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

export type CornerCaptureFunction = (
  onSample?: (sampleCount: number) => void,
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
        onSample?.(samples.length);
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
      resolve(averagePositions(samples));
    }, CORNER_CAPTURE_DURATION_MS);
  });
