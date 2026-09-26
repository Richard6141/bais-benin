import { HelpTip } from "@/components/forms/help-tip";
import { WORLDCEREAL_ATTRIBUTION, WORLDCEREAL_COLOR } from "./map-config";

// Légende des terres cultivées 2021 (ESA WorldCereal) : une carte de référence d'une année passée,
// à comparer avec la carte des cultures et les champs détectés, jamais à confondre avec la
// campagne en cours. Attribution et année toujours visibles (licence CC BY 4.0).
export function WorldCerealLegend() {
  return (
    <div className="rounded-lg border bg-card p-3 text-xs">
      <div className="flex items-center gap-1">
        <p className="font-medium">Terres cultivées 2021</p>
        <HelpTip label="Terres cultivées 2021">
          Carte mondiale de l&apos;Agence spatiale européenne (ESA WorldCereal) : les cultures
          temporaires de la saison 2020-2021, vues à 10 m et affichées ici à environ 75 m.
          C&apos;est une référence d&apos;une année passée, pas la campagne en cours. Elle se trompe
          davantage en Afrique qu&apos;ailleurs, et des coupures nettes apparaissent entre ses zones
          de calcul. À comparer avec la carte des cultures et les champs détectés.
        </HelpTip>
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        <li className="flex items-center gap-2">
          <span
            className="size-3.5 shrink-0 rounded-sm border border-black/10"
            style={{ background: WORLDCEREAL_COLOR }}
          />
          <span className="text-muted-foreground">Cultures temporaires en 2021</span>
        </li>
      </ul>
      <p className="mt-2 font-medium text-warning">Carte de 2021, pas la campagne en cours</p>
      <p className="mt-1 text-muted-foreground">{WORLDCEREAL_ATTRIBUTION}</p>
    </div>
  );
}
