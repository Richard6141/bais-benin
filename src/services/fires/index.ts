import { getServerEnv } from "@/lib/env";
import type {
  BBox,
  FireDetectionProvider,
  FireFetchResult,
  RawFireDetection,
} from "@/services/ports/fire-detection-provider";
import { FirmsPublicFileProvider } from "./firms-public";

// Choix du fournisseur de feux actifs (ADR-0022) : fichiers publics NASA FIRMS par défaut, jeu
// fixe pour les tests et la démonstration hors réseau.

/** Détections données d'avance (tests, démonstration hors réseau). */
export class FixtureFireProvider implements FireDetectionProvider {
  readonly id = "fixture";

  constructor(private readonly detections: RawFireDetection[] = []) {}

  async fetchRecent(bbox: BBox): Promise<FireFetchResult> {
    const [west, south, east, north] = bbox;
    return {
      detections: this.detections.filter(
        (d) =>
          d.longitude >= west && d.longitude <= east && d.latitude >= south && d.latitude <= north,
      ),
      failedFiles: [],
    };
  }
}

export function getFireProvider(): FireDetectionProvider {
  const env = getServerEnv();
  return env.FIRE_PROVIDER === "fixture"
    ? new FixtureFireProvider()
    : new FirmsPublicFileProvider(env.FIRMS_BASE_URL);
}

export { FirmsPublicFileProvider, parseFirmsCsv } from "./firms-public";
