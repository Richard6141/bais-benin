import { getServerEnv } from "@/lib/env";
import type { RemoteSensingProvider } from "@/services/ports/remote-sensing-provider";
import { createCdseProvider } from "./cdse";
import { createFixtureRemoteSensingProvider } from "./fixture-provider";

export {
  buildProcessBody,
  buildStacSearchBody,
  buildStatisticsBody,
  CDSE_DEFAULTS,
  createCdseProvider,
  parseStatistics,
} from "./cdse";
export {
  FIXTURE_CLASS_CONFUSION,
  createFixtureRemoteSensingProvider,
  seasonalNdvi,
} from "./fixture-provider";
export { MASKED_SCL_CLASSES } from "./evalscripts";
export { CROP_CLASS_CODES, CROP_CLASSES, type CropClass } from "./crop-classes";

let provider: RemoteSensingProvider | null = null;

// Fournisseur choisi par configuration, une instance par processus (le jeton OAuth y est gardé).
// CDSE par défaut : la recherche de scènes marche sans compte, le traitement avec.
export function getRemoteSensingProvider(): RemoteSensingProvider {
  if (provider) return provider;
  const env = getServerEnv();
  provider =
    env.SATELLITE_PROVIDER === "fixture"
      ? createFixtureRemoteSensingProvider()
      : createCdseProvider({
          clientId: env.CDSE_CLIENT_ID,
          clientSecret: env.CDSE_CLIENT_SECRET,
          stacUrl: env.CDSE_STAC_URL,
          processingUrl: env.CDSE_PROCESSING_URL,
          tokenUrl: env.CDSE_TOKEN_URL,
        });
  return provider;
}
