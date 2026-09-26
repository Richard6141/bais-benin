import type { ReactNode } from "react";
import { MinistryLogo } from "@/components/brand/ministry-logo";

interface PrintLayoutProps {
  title: string;
  /** Filtres appliqués, en clair (« Campagne 2025-2026 · Maïs · Tout le pays »). */
  scope: string;
  /** Date de la donnée la plus récente, déjà formatée. */
  dataDate: string;
  /** Provenance imprimée en pied : sources, fiabilité, secret statistique. */
  provenance: ReactNode;
  /** Commandes (imprimer, retour) : masquées à l'impression. */
  actions?: ReactNode;
  children: ReactNode;
}

// Mise en page d'une fiche imprimable : en-tête institutionnel avec le périmètre et la date des
// données, contenu, provenance en pied. Lisible en noir et blanc : aucune information portée par
// la seule couleur.
export function PrintLayout({
  title,
  scope,
  dataDate,
  provenance,
  actions,
  children,
}: PrintLayoutProps) {
  return (
    <article className="mx-auto flex w-full max-w-4xl flex-col gap-6 print:max-w-none">
      {actions ? <div className="flex flex-wrap gap-2 print:hidden">{actions}</div> : null}
      <header className="flex items-start justify-between gap-4 border-b pb-4" data-print-block>
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Centre de pilotage, fiche imprimable
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm">{scope}</p>
          <p className="text-xs text-muted-foreground">Données au {dataDate}</p>
        </div>
        <MinistryLogo className="h-14" />
      </header>
      {children}
      <footer className="border-t pt-4 text-xs text-muted-foreground" data-print-block>
        {provenance}
      </footer>
    </article>
  );
}
