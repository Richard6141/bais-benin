import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { LaureatesTable } from "@/features/public-ranking/laureates-table";
import { cachedPublicRanking } from "@/features/public-ranking/cached";

export const dynamic = "force-dynamic";

const longDate = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Africa/Porto-Novo",
});

async function load(id: string) {
  return z.uuid().safeParse(id).success ? cachedPublicRanking(id) : null;
}

export async function generateMetadata(props: PageProps<"/palmares/[id]">): Promise<Metadata> {
  const ranking = await load((await props.params).id);
  return { title: ranking?.title ?? "Palmarès introuvable" };
}

// Un palmarès publié, en entier. Un palmarès retiré par le ministère, ou dont aucun lauréat n'a
// gardé son accord, répond comme introuvable.
export default async function PublicRankingPage(props: PageProps<"/palmares/[id]">) {
  const ranking = await load((await props.params).id);
  if (!ranking) notFound();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-6">
          <PageHeader
            eyebrow="Palmarès des producteurs"
            title={ranking.title}
            description={`Publié par le ministère de l'Agriculture le ${longDate.format(new Date(ranking.publishedAt))}. Le rang est celui du classement complet : un rang absent est celui d'un producteur qui n'a pas souhaité être nommé.`}
            actions={
              <Button asChild variant="outline">
                <Link href="/palmares">Tous les palmarès</Link>
              </Button>
            }
          />
          <LaureatesTable
            laureates={ranking.entries}
            metric={ranking.metric}
            caption={`Campagne ${ranking.campaignCode}. Production en tonnes${ranking.metric === "yield" ? ", rendement en tonnes par hectare cultivé" : ""}.`}
          />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
