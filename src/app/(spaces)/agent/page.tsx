import { BarChart3, ClipboardCheck, FileClock, LandPlot, PlusCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StatTile } from "@/components/data-display/stat-tile";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { FarmList } from "@/features/registry/agent/farm-list";
import { LocalFarms } from "@/features/registry/agent/local-farms";
import { OfflineReadiness } from "@/features/registry/agent/offline-readiness";
import { countFarmsForActor, listFarmsForActor, scopedCommunes } from "@/modules/registry";

export const metadata: Metadata = { title: "Espace agent" };

const SECONDARY = [
  {
    href: "/agent/verification",
    title: "À vérifier",
    description: "Exploitations déclarées de vos communes, les plus anciennes d'abord.",
    icon: ClipboardCheck,
  },
  {
    href: "/agent/en-cours",
    title: "En cours",
    description: "Reprenez un enregistrement là où vous l'avez laissé.",
    icon: FileClock,
  },
  {
    href: "/agent/exploitations",
    title: "Toutes les exploitations",
    description: "Recherche par nom, numéro ou code, filtre par statut.",
    icon: LandPlot,
  },
  {
    href: "/agent/tableau-de-bord",
    title: "Tableau de bord",
    description: "Indicateurs de vos communes : cultures, production, vérifications en attente.",
    icon: BarChart3,
  },
] as const;

export default async function AgentHomePage() {
  const user = await requireRole("AGENT_AGRICULTURE");
  const [counts, recent, scope] = await Promise.all([
    countFarmsForActor(user.actor),
    listFarmsForActor(user.actor, { limit: 5 }),
    scopedCommunes(user.actor),
  ]);
  const communeLabel =
    scope === "all"
      ? "Tout le territoire"
      : scope === "none"
        ? "Aucune commune affectée"
        : scope.map((c) => c.name).join(", ");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Espace agent de terrain"
        title={`Bonjour, ${user.name}`}
        description={`Votre périmètre : ${communeLabel}.`}
        actions={
          <Button asChild size="lg" className="h-12 px-5">
            <Link href="/agent/enregistrer">
              <PlusCircle aria-hidden />
              Enregistrer une exploitation
            </Link>
          </Button>
        }
      />

      <OfflineReadiness userId={user.id} />

      <section aria-label="Chiffres de votre périmètre" className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Exploitations" value={counts.total} source="Registre national" />
        <StatTile
          label="À vérifier"
          value={counts.declared}
          source="Déclarées, sans visite"
          reliability="DECLARED"
        />
        <StatTile
          label="Vérifiées sur le terrain"
          value={counts.verified}
          source="Visites enregistrées"
          reliability="FIELD_VERIFIED"
        />
      </section>

      <section aria-label="Raccourcis" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SECONDARY.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group rounded-xl focus-visible:outline-none"
          >
            <Card className="h-full transition-colors group-hover:border-primary/50 group-focus-visible:ring-2 group-focus-visible:ring-ring">
              <CardHeader>
                <item.icon className="mb-1 size-5 text-primary" aria-hidden />
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </section>

      <LocalFarms userId={user.id} />

      <section aria-labelledby="recent-title" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 id="recent-title" className="text-lg font-semibold">
            Dernières mises à jour
          </h2>
          <Button asChild variant="link" size="sm">
            <Link href="/agent/exploitations">Voir tout</Link>
          </Button>
        </div>
        <FarmList
          items={recent.items}
          emptyTitle="Aucune exploitation dans votre périmètre"
          emptyDescription="Enregistrez la première : sept écrans courts, même sans réseau."
        />
      </section>
    </div>
  );
}
