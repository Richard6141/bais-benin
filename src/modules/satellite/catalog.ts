import { logger } from "@/lib/logger";
import { RemoteSensingProviderError } from "@/services/ports/remote-sensing-provider";
import { getRemoteSensingProvider } from "@/services/remote-sensing";
import {
  BENIN_IMAGERY_BBOX,
  CLEAR_SCENE_MAX_CLOUD,
  ROLLING_PERIOD,
  defaultPeriod,
  periodRange,
  recentPeriods,
  summarizePeriod,
  type ImageryPeriod,
} from "./periods";

// Catalogue des périodes : scènes Sentinel-2 L2A du Bénin par mois, lues dans le catalogue STAC
// public de Copernicus (sans compte). Gardé six heures en mémoire : les nouvelles scènes
// arrivent tous les deux à cinq jours, inutile d'interroger le catalogue à chaque visite.

const CACHE_TTL_MS = 6 * 3_600_000;
// Plafond de scènes dégagées lues par mois : une page du catalogue.
const SCENES_PER_MONTH = 1000;
// Mois interrogés en même temps : quatre requêtes de 3 à 4 s, sans charger le catalogue public.
const CONCURRENCY = 4;

export interface ImageryCatalog {
  /** Faux tant que le compte CDSE n'est pas configuré : pas d'image, périodes seulement. */
  imageryAvailable: boolean;
  attribution: string;
  defaultPeriod: string | null;
  periods: ImageryPeriod[];
  checkedAt: string;
}

let cache: { expiresAt: number; value: ImageryCatalog } | null = null;
let refreshing: Promise<ImageryCatalog> | null = null;

async function buildCatalog(now: Date): Promise<ImageryCatalog> {
  const provider = getRemoteSensingProvider();
  // La fenêtre glissante d'abord, puis les douze mois.
  const months = [ROLLING_PERIOD, ...recentPeriods(now)];
  const periods: ImageryPeriod[] = new Array(months.length);
  let complete = true;
  async function summarize(index: number) {
    const period = months[index] ?? "";
    const { from, to } = periodRange(period, now);
    try {
      const scenes = await provider.searchScenes({
        bbox: BENIN_IMAGERY_BBOX,
        from,
        to,
        limit: SCENES_PER_MONTH,
        maxCloudCover: CLEAR_SCENE_MAX_CLOUD,
      });
      periods[index] = summarizePeriod(period, scenes, now);
    } catch (error) {
      if (!(error instanceof RemoteSensingProviderError)) throw error;
      logger.warn({ err: error, period }, "Catalogue Sentinel-2 injoignable pour cette période");
      complete = false;
      periods[index] = summarizePeriod(period, [], now);
    }
  }
  for (let start = 0; start < months.length; start += CONCURRENCY) {
    const batch = months.slice(start, start + CONCURRENCY).map((_, offset) => start + offset);
    await Promise.all(batch.map(summarize));
  }
  const value: ImageryCatalog = {
    imageryAvailable: provider.canProcess && provider.id === "cdse",
    attribution: provider.provenance.attribution,
    defaultPeriod: defaultPeriod(periods),
    periods,
    checkedAt: now.toISOString(),
  };
  // Un catalogue incomplet (réseau) n'est gardé que dix minutes.
  cache = { expiresAt: now.getTime() + (complete ? CACHE_TTL_MS : 600_000), value };
  return value;
}

// Le premier calcul prend une vingtaine de secondes (douze mois de catalogue). Ensuite, une
// copie périmée est rendue tout de suite pendant que la suivante se calcule en arrière-plan ;
// des appels simultanés partagent le même calcul.
export async function getImageryCatalog(now = new Date()): Promise<ImageryCatalog> {
  if (cache && cache.expiresAt > now.getTime()) return cache.value;
  refreshing ??= buildCatalog(now).finally(() => {
    refreshing = null;
  });
  if (cache) {
    refreshing.catch((error: unknown) => {
      logger.warn({ err: error }, "Rafraîchissement du catalogue Sentinel-2 en échec");
    });
    return cache.value;
  }
  return refreshing;
}
