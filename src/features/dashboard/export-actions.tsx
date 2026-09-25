import { Download, FileText } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { withQuery } from "./dashboard-logic";

interface ExportActionsProps {
  /** Chaîne de requête des filtres courants (sans « ? »). */
  query: string;
  /** Commune de la fiche C, ajoutée aux exports. */
  communeCode?: string;
  /** Faux sur la fiche imprimable elle-même. */
  withPrintSheet?: boolean;
}

function exportHref(kind: "indicators" | "production", query: string, communeCode?: string) {
  const search = new URLSearchParams(query);
  search.set("kind", kind);
  if (communeCode) search.set("communeCode", communeCode);
  return `/api/v1/analytics/export.csv?${search.toString()}`;
}

// E : exports CSV (ouverture directe dans Excel en français) et fiche imprimable, avec les
// filtres de la vue. Les exports passent par l'API, qui applique le périmètre, masque les
// cellules de moins de 5 exploitations et journalise chaque sortie de données.
export function ExportActions({ query, communeCode, withPrintSheet = true }: ExportActionsProps) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {withPrintSheet ? (
        <Button asChild variant="outline" className="h-11">
          <Link href={withQuery("/pilotage/fiche", query) as Route}>
            <FileText aria-hidden />
            Fiche imprimable
          </Link>
        </Button>
      ) : null}
      <Button asChild variant="outline" className="h-11">
        {/* Téléchargement : un lien simple, sans navigation côté client. */}
        <a href={exportHref("indicators", query, communeCode)} download>
          <Download aria-hidden />
          Indicateurs (CSV)
        </a>
      </Button>
      <Button asChild variant="outline" className="h-11">
        <a href={exportHref("production", query, communeCode)} download>
          <Download aria-hidden />
          Production (CSV)
        </a>
      </Button>
    </div>
  );
}
