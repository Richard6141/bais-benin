import { SourceCaption } from "@/components/data-display/source-caption";

// Découpage administratif du Bénin (docs/08, §2). Chiffres officiels, stables.
const figures = [
  { label: "Départements", value: "12" },
  { label: "Communes", value: "77" },
  { label: "Arrondissements", value: "546" },
  { label: "Villages et quartiers", value: "≈ 5 300" },
];

export function TerritoryFigures() {
  return (
    <section aria-labelledby="territoire" className="border-y border-border/70">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <h2 id="territoire" className="sr-only">
          Le territoire couvert
        </h2>
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {figures.map((figure) => (
            <div key={figure.label} className="flex flex-col gap-1">
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {figure.label}
              </dt>
              <dd className="tabular text-3xl font-semibold tracking-tight">{figure.value}</dd>
            </div>
          ))}
        </dl>
        <SourceCaption
          className="mt-6"
          source="découpage administratif officiel de la République du Bénin"
          date="référentiel 2026"
        />
      </div>
    </section>
  );
}
