import { SourceCaption } from "@/components/data-display/source-caption";
import { listDepartements } from "@/modules/territory";

// Le territoire couvert, lu dans la base : les départements et communes sont ceux du
// référentiel chargé, pas des constantes d'affichage.
export async function TerritoryFigures() {
  const departements = await listDepartements();
  const communeCount = departements.reduce((sum, d) => sum + d.communeCount, 0);

  const figures = [
    { label: "Départements", value: String(departements.length) },
    { label: "Communes", value: String(communeCount) },
    { label: "Arrondissements", value: "546" },
    { label: "Cultures suivies", value: "21" },
  ];

  return (
    <section aria-labelledby="territoire" className="border-b border-border/70 bg-card">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <h2 id="territoire" className="sr-only">
          Le territoire couvert
        </h2>
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {figures.map((figure) => (
            <div key={figure.label} className="flex flex-col gap-1">
              <dd className="tabular order-1 text-3xl font-semibold tracking-tight">
                {figure.value}
              </dd>
              <dt className="order-2 text-sm text-muted-foreground">{figure.label}</dt>
            </div>
          ))}
        </dl>
        <SourceCaption
          className="mt-6"
          source="découpage administratif officiel et référentiel des cultures"
          date="septembre 2026"
        />
      </div>
    </section>
  );
}
