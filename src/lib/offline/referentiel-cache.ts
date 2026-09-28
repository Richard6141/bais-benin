import type { ReferentielBundle } from "@/modules/registry/referentiel";
import type { AgentDatabase, LocalFarm } from "./db";

// Cache local du référentiel et des exploitations du périmètre (parcours F du registre).
// Le référentiel est stocké entier sous une seule clé : il pèse moins de 2 Mo par commune
// et se remplace d'un bloc à chaque nouvelle version.

export const REFERENTIEL_KEY = "bundle";
export const FARMS_CACHED_AT_KEY = "farms.cachedAt";

export async function loadReferentiel(db: AgentDatabase): Promise<ReferentielBundle | null> {
  const row = await db.referentiel.get(REFERENTIEL_KEY);
  return (row?.value as ReferentielBundle | undefined) ?? null;
}

export async function saveReferentiel(db: AgentDatabase, bundle: ReferentielBundle): Promise<void> {
  await db.referentiel.put({
    key: REFERENTIEL_KEY,
    value: bundle,
    updatedAt: new Date().toISOString(),
  });
}

export interface FarmsCacheInfo {
  cachedAt: string | null;
  count: number;
}

export async function farmsCacheInfo(db: AgentDatabase): Promise<FarmsCacheInfo> {
  const [row, count] = await Promise.all([
    db.referentiel.get(FARMS_CACHED_AT_KEY),
    db.farms.count(),
  ]);
  return { cachedAt: (row?.value as string | undefined) ?? null, count };
}

// Forme renvoyée par GET /api/v1/registry/farms (FarmListItem sérialisé).
export interface RemoteFarmListItem {
  id: string;
  code: string;
  name: string | null;
  farmer: { id: string; code: string; displayName: string; phone: string | null };
  commune: { code: string; name: string };
  village: string | null;
  declaredAreaHa: number;
  computedAreaHa: number | null;
  verificationStatus: string;
  verifiedAt: string | null;
  parcelCount: number;
  cropCodes: string[];
  updatedAt: string;
  version: number;
}

export function toLocalFarm(item: RemoteFarmListItem): LocalFarm {
  return {
    id: item.id,
    code: item.code,
    farmerId: item.farmer.id,
    farmerName: item.farmer.displayName,
    communeCode: item.commune.code,
    communeName: item.commune.name,
    verificationStatus: item.verificationStatus,
    declaredAreaHa: item.declaredAreaHa,
    parcelCount: item.parcelCount,
    cropCodes: item.cropCodes,
    version: item.version,
    syncState: "SYNCED",
    updatedAt: item.updatedAt,
  };
}

// Remplace les exploitations synchronisées par la liste serveur, sans toucher aux
// exploitations créées localement et pas encore parties (LOCAL_ONLY).
export async function replaceSyncedFarms(
  db: AgentDatabase,
  items: RemoteFarmListItem[],
): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction("rw", db.farms, db.referentiel, async () => {
    await db.farms.where("syncState").equals("SYNCED").delete();
    await db.farms.bulkPut(items.map(toLocalFarm));
    await db.referentiel.put({ key: FARMS_CACHED_AT_KEY, value: now, updatedAt: now });
  });
}

export interface DownloadProgress {
  block: "referentiel" | "farms" | "done";
  loaded: number;
  total: number | null;
}

interface DownloadOptions {
  fetchImpl?: typeof fetch;
  onProgress?: (progress: DownloadProgress) => void;
}

// Téléchargement complet pour le premier lancement : référentiel puis exploitations page par page.
export async function downloadOfflineData(
  db: AgentDatabase,
  options: DownloadOptions = {},
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const report = options.onProgress ?? (() => undefined);

  report({ block: "referentiel", loaded: 0, total: null });
  // Sans le cache HTTP (private, 5 min) : après une réaffectation, la copie gardée par le
  // navigateur porterait encore l'ancien périmètre.
  const referentielResponse = await fetchImpl("/api/v1/referentiel", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!referentielResponse.ok)
    throw new Error(`Référentiel indisponible (${referentielResponse.status})`);
  const bundle = (await referentielResponse.json()) as ReferentielBundle;
  await saveReferentiel(db, bundle);
  report({ block: "referentiel", loaded: 1, total: 1 });

  const items: RemoteFarmListItem[] = [];
  let cursor: string | null = null;
  do {
    const url = `/api/v1/registry/farms?limit=200${cursor ? `&cursor=${cursor}` : ""}`;
    const response = await fetchImpl(url, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`Exploitations indisponibles (${response.status})`);
    const page = (await response.json()) as {
      items: RemoteFarmListItem[];
      nextCursor: string | null;
    };
    items.push(...page.items);
    cursor = page.nextCursor;
    report({ block: "farms", loaded: items.length, total: null });
  } while (cursor);
  await replaceSyncedFarms(db, items);
  report({ block: "done", loaded: items.length, total: items.length });
}
