import { unstable_cache, updateTag } from "next/cache";
import { getPublicRanking, listPublicRankings } from "@/modules/public-ranking";

// Page publique des palmarès en cache court (revue de sécurité R8) : une visite anonyme ne lit
// plus la base à chaque fois. Toute publication, tout retrait et tout changement d'accord
// expirent le cache sur-le-champ (expirePublicRankings, depuis l'action serveur) : le retrait
// d'un accord reste immédiat sur l'instance qui l'a reçu, et au plus 2 minutes sur les autres.

export const PUBLIC_RANKING_TAG = "palmares-public";
const TTL_SECONDS = 120;

export const cachedPublicRankings = unstable_cache(
  async () =>
    (await listPublicRankings()).map((ranking) => ({
      ...ranking,
      publishedAt: ranking.publishedAt.toISOString(),
    })),
  ["palmares-public-liste"],
  { revalidate: TTL_SECONDS, tags: [PUBLIC_RANKING_TAG] },
);

export const cachedPublicRanking = unstable_cache(
  async (id: string) => {
    const ranking = await getPublicRanking(id);
    return ranking ? { ...ranking, publishedAt: ranking.publishedAt.toISOString() } : null;
  },
  ["palmares-public-fiche"],
  { revalidate: TTL_SECONDS, tags: [PUBLIC_RANKING_TAG] },
);

/** À appeler depuis une action serveur après une publication, un retrait ou un accord. */
export function expirePublicRankings(): void {
  updateTag(PUBLIC_RANKING_TAG);
}
