import type { Metadata, Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { cachedPublicRankings } from "@/features/public-ranking/cached";

export const metadata: Metadata = {
  title: "Palmarès des producteurs",
  description: "Les meilleurs producteurs distingués par le ministère, campagne par campagne.",
};

export const dynamic = "force-dynamic";

const longDate = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Africa/Porto-Novo",
});
const tonnes = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

// Page publique des palmarès publiés par le ministère (complément d'ADR-0018). Seuls y figurent
// les producteurs qui ont donné leur accord depuis leur compte ; les autres ne sont jamais nommés.
export default async function PublicRankingsPage() {
  const rankings = await cachedPublicRankings();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <PageHeader
          title="Palmarès des producteurs"
          description="Les meilleurs producteurs de chaque campagne, distingués par le ministère de l'Agriculture. Seuls figurent ceux qui ont accepté d'être nommés ; le rang est celui du classement complet de la campagne."
        />
        {rankings.length === 0 ? (
          <p className="mt-8 text-muted-foreground">
            Aucun palmarès n&apos;est publié pour le moment.
          </p>
        ) : (
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {rankings.map((ranking) => (
              <li key={ranking.id} className="flex flex-col gap-3 rounded-sm border p-5">
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg leading-snug font-semibold">
                    <Link
                      href={`/palmares/${ranking.id}` as Route}
                      className="underline-offset-4 hover:underline"
                    >
                      {ranking.title}
                    </Link>
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Publié le {longDate.format(new Date(ranking.publishedAt))} · {ranking.laureates}{" "}
                    lauréat
                    {ranking.laureates > 1 ? "s" : ""}
                  </p>
                </div>
                <ol className="flex flex-col gap-1 text-sm">
                  {ranking.podium.map((laureate) => (
                    <li key={laureate.rank} className="flex items-baseline gap-2">
                      <span className="tabular w-8 shrink-0 text-right font-bold">
                        {laureate.rank}
                      </span>
                      <span className="font-medium">{laureate.name}</span>
                      <span className="text-muted-foreground">
                        {laureate.communeName} · {tonnes.format(laureate.productionT)} t
                      </span>
                    </li>
                  ))}
                </ol>
                <Link
                  href={`/palmares/${ranking.id}` as Route}
                  className="w-fit text-sm font-medium underline underline-offset-4"
                >
                  Voir tous les lauréats
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
