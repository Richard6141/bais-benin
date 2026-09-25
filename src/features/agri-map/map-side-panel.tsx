import { X } from "lucide-react";
import { MaskedValue } from "@/components/data-display/masked-value";
import { ReliabilityBadge } from "@/components/data-display/reliability-badge";
import { SourceCaption } from "@/components/data-display/source-caption";
import { Button } from "@/components/ui/button";
import type { CommuneStats } from "@/modules/analytics";
import { METRICS } from "./map-config";
import type { TerritoryStatsState } from "./use-territory-stats";

interface MapSidePanelProps {
  stats: TerritoryStatsState;
  selected: CommuneStats | null;
  cropNames: Map<string, string>;
  onClearSelection: () => void;
}

const integer = new Intl.NumberFormat("fr-FR");
const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });

// Panneau de lecture : le total des filtres courants, puis la commune sélectionnée.
// Les dix premières communes donnent un point d'entrée sans chercher sur la carte.
export function MapSidePanel({ stats, selected, cropNames, onClearSelection }: MapSidePanelProps) {
  const items = stats.items;
  // B3 : les lignes masquées (secret statistique, k=5) portent des effectifs nuls. Le total
  // affiché ici les compte pour zéro plutôt que de planter — il sous-estime donc légèrement
  // les totaux quand des communes sont masquées, ce qui est le compromis voulu : jamais
  // reconstituer un effectif caché par calcul côté client.
  const totals = items.reduce(
    (acc, item) => ({
      farmCount: acc.farmCount + (item.farmCount ?? 0),
      farmerCount: acc.farmerCount + (item.farmerCount ?? 0),
      declaredAreaHa: acc.declaredAreaHa + (item.declaredAreaHa ?? 0),
      communes: acc.communes + ((item.farmCount ?? 0) > 0 || item.masked ? 1 : 0),
    }),
    { farmCount: 0, farmerCount: 0, declaredAreaHa: 0, communes: 0 },
  );
  const top = [...items]
    .filter((item) => (item.farmCount ?? 0) > 0)
    .sort((a, b) => (b.farmCount ?? 0) - (a.farmCount ?? 0))
    .slice(0, 10);
  const generatedAt = stats.provenance
    ? new Intl.DateTimeFormat("fr-BJ", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(stats.provenance.generatedAt),
      )
    : undefined;

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto">
      <section aria-labelledby="synthese-titre">
        <h2 id="synthese-titre" className="text-sm font-medium text-muted-foreground">
          {stats.status === "loading" ? "Calcul en cours…" : "Pour ces filtres"}
        </h2>
        <dl className="mt-2 grid grid-cols-2 gap-3">
          <Figure label="Exploitations" value={integer.format(totals.farmCount)} />
          <Figure label="Agriculteurs" value={integer.format(totals.farmerCount)} />
          <Figure
            label="Hectares déclarés"
            value={METRICS.declaredAreaHa.format(totals.declaredAreaHa)}
          />
          <Figure label="Communes concernées" value={integer.format(totals.communes)} />
        </dl>
        {stats.provenance ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ReliabilityBadge level={stats.provenance.reliability} />
            <span className="tabular text-xs text-muted-foreground">
              {percent.format(stats.provenance.verifiedShare)} vérifiées
            </span>
          </div>
        ) : null}
        <SourceCaption
          className="mt-2"
          source="registre BAIS (données de démonstration)"
          date={generatedAt}
        />
      </section>

      {selected ? (
        <section aria-labelledby="commune-titre" className="rounded-lg border bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 id="commune-titre" className="text-lg font-semibold">
                {selected.communeName}
              </h2>
              <p className="tabular text-xs text-muted-foreground">
                {selected.communeCode} · {selected.departementCode}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Fermer la fiche commune"
              onClick={onClearSelection}
            >
              <X aria-hidden />
            </Button>
          </div>
          {selected.masked ? (
            // B3 : secret statistique — moins de 5 exploitations dans cette commune pour ces
            // filtres, tout détail serait individuellement reconnaissable.
            <p className="mt-3 text-sm text-muted-foreground">
              <MaskedValue /> Effectif trop faible pour être publié (moins de 5 exploitations).
            </p>
          ) : (
            <>
              <dl className="mt-3 grid grid-cols-2 gap-3">
                <Figure label="Exploitations" value={integer.format(selected.farmCount ?? 0)} />
                <Figure label="Agriculteurs" value={integer.format(selected.farmerCount ?? 0)} />
                <Figure
                  label="Hectares déclarés"
                  value={METRICS.declaredAreaHa.format(selected.declaredAreaHa ?? 0)}
                />
                <Figure label="Part vérifiée" value={percent.format(selected.verifiedShare ?? 0)} />
              </dl>
              {selected.cropCodes && selected.cropCodes.length > 0 ? (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground">Cultures présentes</p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {selected.cropCodes.map((code) => (
                      <li key={code} className="rounded-sm border px-2 py-0.5 text-xs">
                        {cropNames.get(code) ?? code}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {selected.reliability ? (
                <div className="mt-3">
                  <ReliabilityBadge level={selected.reliability} />
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : (
        <section aria-labelledby="top-titre">
          <h2 id="top-titre" className="text-sm font-medium text-muted-foreground">
            Communes les plus représentées
          </h2>
          {top.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Aucune exploitation ne correspond aux filtres.
            </p>
          ) : (
            <ol className="mt-2 divide-y rounded-lg border bg-card">
              {top.map((item) => (
                <li
                  key={item.communeCode}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span>
                    {item.communeName}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {item.departementCode}
                    </span>
                  </span>
                  <span className="tabular font-medium">{integer.format(item.farmCount ?? 0)}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Cliquez une commune sur la carte pour sa fiche.
          </p>
        </section>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular text-xl font-semibold">{value}</dd>
    </div>
  );
}
