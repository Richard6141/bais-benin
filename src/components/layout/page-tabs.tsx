"use client";

import { useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface PageTab {
  /** Valeur dans l'adresse (?onglet=production) : courte, en minuscules, sans accent. */
  value: string;
  label: string;
  /** Petit compteur à côté du libellé (alertes en cours, demandes à traiter). */
  count?: number;
  content: ReactNode;
}

interface PageTabsProps {
  /** Nom de l'ensemble d'onglets pour les lecteurs d'écran. */
  label: string;
  tabs: readonly PageTab[];
  /** Onglet ouvert à l'arrivée, lu par la page dans son adresse ; le premier sinon. */
  initial?: string | null;
  /** Nom du paramètre d'adresse, pour deux ensembles d'onglets sur une même page. */
  param?: string;
  className?: string;
}

// Onglets d'une page longue : une vue à la fois au lieu de sections empilées. L'onglet ouvert est
// gardé dans l'adresse (sans rechargement), pour qu'un lien ou un retour arrière retrouve la même
// vue. Les onglets passent à la ligne sur un écran étroit plutôt que de cacher une entrée derrière
// un défilement.
export function PageTabs({ label, tabs, initial, param = "onglet", className }: PageTabsProps) {
  const first = tabs[0]?.value ?? "";
  const requested = initial && tabs.some((tab) => tab.value === initial) ? initial : first;
  const [value, setValue] = useState(requested);
  // Un lien vers la même page avec un autre onglet (?onglet=carte) garde ce composant monté : on
  // suit alors l'onglet demandé par la nouvelle adresse.
  const [lastRequested, setLastRequested] = useState(requested);
  if (requested !== lastRequested) {
    setLastRequested(requested);
    setValue(requested);
  }

  const select = (next: string) => {
    setValue(next);
    const url = new URL(window.location.href);
    if (next === first) url.searchParams.delete(param);
    else url.searchParams.set(param, next);
    window.history.replaceState(window.history.state, "", url);
  };

  return (
    <Tabs value={value} onValueChange={select} className={cn("gap-5", className)}>
      <TabsList
        variant="line"
        aria-label={label}
        className="h-auto w-full flex-wrap justify-start gap-x-1 gap-y-0 rounded-none border-b p-0 print:hidden"
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="h-11 flex-none rounded-none border-0 px-3 text-sm font-semibold after:bottom-0 after:bg-primary data-[state=active]:text-primary md:h-10"
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 ? (
              <span className="tabular rounded-sm bg-muted px-1.5 text-xs font-semibold text-muted-foreground">
                {tab.count}
              </span>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="flex flex-col gap-6">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
