import { findCachedImage, storeCachedImage } from "@/database/sql/satellite.sql";
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
// public de Copernicus (sans compte). Treize recherches prennent jusqu'à une minute : le dernier
// catalogue connu est gardé en base et servi tout de suite, même après un redémarrage, et refait
// en arrière-plan quand il a plus de six heures (les nouvelles scènes arrivent tous les deux à
// cinq jours). À froid, sans rien en base, une réponse immédiate donne les périodes sans leurs
// comptes de scènes, la fenêtre de 60 jours par défaut, et le calcul se fait derrière.

const CACHE_TTL_MS = 6 * 3_600_000;
/** Un catalogue incomplet (réseau) est refait dix minutes plus tard. */
const INCOMPLETE_TTL_MS = 600_000;
/** Délai d'une page du catalogue STAC : une recherche lente ne bloque pas les autres. */
const STAC_TIMEOUT_MS = 12_000;
// Emplacement en base : la table des images satellite, sous une période à part. Le contenu est le
// catalogue en JSON.
const STORED = { layer: "TRUE_COLOR", period: "catalogue", tileKey: "s2-benin-v1" } as const;
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
  /** Vrai tant que les comptes de scènes ne sont pas encore connus (premier calcul en cours). */
  partial: boolean;
}

let memory: { value: ImageryCatalog; freshUntil: number } | null = null;
let refreshing: Promise<ImageryCatalog> | null = null;

async function buildCatalog(now: Date): Promise<{ value: ImageryCatalog; complete: boolean }> {
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
        timeoutMs: STAC_TIMEOUT_MS,
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
  return {
    value: {
      ...availability(),
      defaultPeriod: defaultPeriod(periods),
      periods,
      checkedAt: now.toISOString(),
      partial: false,
    },
    complete,
  };
}

function availability(): Pick<ImageryCatalog, "imageryAvailable" | "attribution"> {
  const provider = getRemoteSensingProvider();
  return {
    imageryAvailable: provider.canProcess && provider.id === "cdse",
    attribution: provider.provenance.attribution,
  };
}

/** Réponse immédiate, sans aucun catalogue connu : les périodes, sans leurs comptes de scènes. */
function provisionalCatalog(now: Date): ImageryCatalog {
  return {
    ...availability(),
    defaultPeriod: ROLLING_PERIOD,
    periods: [ROLLING_PERIOD, ...recentPeriods(now)].map((period) =>
      summarizePeriod(period, [], now),
    ),
    checkedAt: now.toISOString(),
    partial: true,
  };
}

async function readStored(): Promise<ImageryCatalog | null> {
  const row = await findCachedImage(STORED.layer, STORED.period, STORED.tileKey);
  if (!row?.image) return null;
  const value = JSON.parse(new TextDecoder().decode(row.image)) as ImageryCatalog;
  return Array.isArray(value.periods) && typeof value.checkedAt === "string" ? value : null;
}

function refresh(now: Date): Promise<ImageryCatalog> {
  refreshing ??= buildCatalog(now)
    .then(async ({ value, complete }) => {
      memory = {
        value,
        freshUntil: now.getTime() + (complete ? CACHE_TTL_MS : INCOMPLETE_TTL_MS),
      };
      // Seul un catalogue complet remplace celui gardé en base.
      if (complete) {
        await storeCachedImage(
          STORED.layer,
          STORED.period,
          STORED.tileKey,
          new TextEncoder().encode(JSON.stringify(value)),
          null,
        );
      }
      return value;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function refreshInBackground(now: Date) {
  refresh(now).catch((error: unknown) => {
    logger.warn({ err: error }, "Rafraîchissement du catalogue Sentinel-2 en échec");
  });
}

/**
 * Catalogue des périodes, toujours rendu vite : de la mémoire, sinon de la base, sinon une
 * réponse provisoire ; un catalogue de plus de six heures est refait en arrière-plan, et des
 * appels simultanés partagent le même calcul.
 */
export async function getImageryCatalog(now = new Date()): Promise<ImageryCatalog> {
  if (!memory) {
    const stored = await readStored().catch((error: unknown) => {
      logger.warn({ err: error }, "Catalogue Sentinel-2 gardé en base illisible");
      return null;
    });
    if (stored) {
      memory = {
        value: { ...stored, ...availability() },
        freshUntil: Date.parse(stored.checkedAt) + CACHE_TTL_MS,
      };
    }
  }
  if (memory) {
    if (memory.freshUntil <= now.getTime()) refreshInBackground(now);
    return memory.value;
  }
  refreshInBackground(now);
  return provisionalCatalog(now);
}
