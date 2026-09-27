"use client";

import { Flame } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Route } from "next";
import { SeverityBadge } from "@/components/data-display/severity-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { FarmFireAlert } from "@/modules/fires/farm-alert";

const FireMiniMap = dynamic(() => import("./fire-mini-map").then((module) => module.FireMiniMap), {
  ssr: false,
  loading: () => <Skeleton className="h-32 w-full" />,
});

// Carte d'alerte en tête de l'accueil agriculteur (chantier K) : le feu le plus proche d'une
// parcelle, où il est par rapport à ce champ et quand le satellite l'a vu (texte calculé par le
// serveur, comme le message envoyé), et le conseil de l'alerte active. Rien ne s'affiche sans feu
// à signaler (le composant appelant ne rend celui-ci que lorsque l'alerte existe).
export function FireAlertCard({ alert }: { alert: FarmFireAlert }) {
  return (
    <section
      aria-labelledby="alerte-feu-titre"
      className="flex flex-col gap-3 rounded-lg border border-laterite/40 bg-laterite-soft p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Flame aria-hidden className="size-6 shrink-0 text-laterite" />
        <h2 id="alerte-feu-titre" className="text-lg font-semibold text-laterite">
          Feu détecté près de votre champ
        </h2>
        <SeverityBadge severity={alert.severity} />
      </div>
      <p className="text-sm">{alert.situation}</p>
      <FireMiniMap farm={alert.farm} fire={alert.fire} />
      <p className="text-sm">{alert.adviceFr}</p>
      <Button asChild className="h-11 self-start">
        <Link href={`/agriculteur/alertes/${alert.alertId}` as Route}>Voir l&apos;alerte</Link>
      </Button>
    </section>
  );
}
