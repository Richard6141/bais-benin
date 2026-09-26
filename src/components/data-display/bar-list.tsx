import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { MaskedValue } from "@/components/data-display/masked-value";
import { NoValue } from "@/components/data-display/no-value";
import { cn } from "@/lib/utils";

export interface BarListItem {
  key: string;
  label: string;
  /** Valeur de la barre ; `masked` : secret statistique, `null` : pas de donnée. */
  value: number | "masked" | null;
  /** Texte de la valeur, déjà formaté (unité comprise). */
  display?: string;
  /** Deuxième ligne : écart au référentiel, part vérifiée… */
  detail?: ReactNode;
  /** Pictogramme placé avant le libellé (CropGlyph). */
  leading?: ReactNode;
  /** Texte à la place de la barre quand la valeur est absente (« récolte non déclarée »). */
  emptyLabel?: string;
  href?: string;
}

interface BarListProps {
  items: readonly BarListItem[];
  /** Nom de la liste pour les lecteurs d'écran. */
  label: string;
  /** Maximum de l'échelle ; par défaut la plus grande valeur de la liste. */
  max?: number;
  className?: string;
}

// Barres horizontales en HTML et CSS, sans bibliothèque de graphiques (comme RainChart) : la
// valeur est écrite en toutes lettres à côté de chaque barre, la barre n'est qu'un repère visuel
// et reste masquée aux lecteurs d'écran. Couleur pleine, jamais de dégradé.
export function BarList({ items, label, max, className }: BarListProps) {
  const scale =
    max ?? Math.max(0, ...items.map((item) => (typeof item.value === "number" ? item.value : 0)));

  return (
    <ul aria-label={label} className={cn("flex flex-col gap-3", className)}>
      {items.map((item) => {
        const width =
          typeof item.value === "number" && scale > 0
            ? Math.max(1, Math.round((item.value / scale) * 100))
            : 0;
        const title = (
          <span className="flex min-w-0 items-center gap-2 font-medium">
            {item.leading}
            <span className="break-words">{item.label}</span>
          </span>
        );
        return (
          <li key={item.key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              {item.href ? (
                <Link
                  href={item.href as Route}
                  className="min-w-0 underline-offset-4 hover:underline"
                >
                  {title}
                </Link>
              ) : (
                title
              )}
              <span className="tabular shrink-0 text-right">
                {item.value === "masked" ? (
                  <MaskedValue />
                ) : item.value === null ? (
                  <span className="text-muted-foreground">{item.emptyLabel ?? <NoValue />}</span>
                ) : (
                  (item.display ?? String(item.value))
                )}
              </span>
            </div>
            <div aria-hidden className="h-2 overflow-hidden bg-muted">
              <div className="h-full bg-primary" style={{ width: `${width}%` }} />
            </div>
            {item.detail ? <p className="text-xs text-muted-foreground">{item.detail}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
