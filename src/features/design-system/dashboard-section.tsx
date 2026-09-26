import { BarList } from "@/components/data-display/bar-list";
import { CampaignComparison } from "@/components/data-display/campaign-comparison";
import { MaskedValue } from "@/components/data-display/masked-value";
import { SortableTable } from "@/components/data-display/sortable-table";
import { PrintButton } from "@/components/layout/print-button";
import { DemoRow, DemoSection } from "@/features/design-system/demo-section";

// Données de démonstration : ordres de grandeur plausibles pour la Donga, sans prétention
// statistique. Une commune résume moins de 5 exploitations : sa ligne montre le secret
// statistique, qui ne se classe pas.
const COMMUNES = [
  { code: "BSL", name: "Bassila", farms: 131, area: 259, share: 0.49 },
  { code: "DJG", name: "Djougou", farms: 109, area: 194, share: 0.52 },
  { code: "CPG", name: "Copargo", farms: 52, area: 82.2, share: 0.37 },
  { code: "OKE", name: "Ouaké", farms: null, area: null, share: null },
];

const integer = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });

export function DashboardSection() {
  return (
    <DemoSection
      id="tableau-de-bord"
      title="Tableau de bord"
      description="Composants du centre de pilotage : chaque valeur est écrite en toutes lettres, les barres ne sont qu'un repère, et une cellule de moins de 5 exploitations n'est jamais publiée."
    >
      <DemoRow label="Barres horizontales (BarList)" className="block">
        <BarList
          label="Production déclarée par culture (démonstration)"
          className="max-w-xl"
          items={[
            {
              key: "maize",
              label: "Maïs",
              value: 412,
              display: "412 t",
              detail: "1,6 t/ha, 52 % vérifiée",
            },
            {
              key: "yam",
              label: "Igname",
              value: 368,
              display: "368 t",
              detail: "9,8 t/ha, 47 % vérifiée",
            },
            { key: "sorghum", label: "Sorgho", value: 96, display: "96 t" },
            { key: "rice", label: "Riz", value: null, emptyLabel: "récolte non déclarée" },
            { key: "sesame", label: "Sésame", value: "masked" },
          ]}
        />
      </DemoRow>
      <DemoRow label="Campagne contre campagne (CampaignComparison)" className="block">
        <CampaignComparison
          metricLabel="Production déclarée (démonstration)"
          series={[
            {
              key: "maize",
              label: "Maïs",
              points: [
                { campaign: "2023-2024", value: 350, display: "350 t" },
                { campaign: "2024-2025", value: 380, display: "380 t" },
                { campaign: "2025-2026", value: 412, display: "412 t" },
              ],
            },
            {
              key: "yam",
              label: "Igname",
              points: [
                { campaign: "2023-2024", value: 402, display: "402 t" },
                { campaign: "2024-2025", value: "masked" },
                { campaign: "2025-2026", value: 368, display: "368 t" },
              ],
            },
          ]}
        />
      </DemoRow>
      <DemoRow label="Tableau triable avec rang et ligne masquée (SortableTable)" className="block">
        <SortableTable
          caption="Communes de la Donga (démonstration)"
          initialSort={{ key: "farms", direction: "descending" }}
          ranked
          columns={[
            { key: "name", label: "Commune" },
            { key: "farms", label: "Exploitations", align: "right" },
            { key: "area", label: "Surface déclarée", align: "right" },
            { key: "share", label: "Part vérifiée", align: "right" },
          ]}
          rows={COMMUNES.map((c) => ({
            key: c.code,
            cells: {
              name: { display: c.name, sort: c.name },
              farms:
                c.farms === null
                  ? { display: <MaskedValue />, sort: null }
                  : { display: integer.format(c.farms), sort: c.farms },
              area:
                c.area === null
                  ? { display: <MaskedValue />, sort: null }
                  : { display: `${integer.format(c.area)} ha`, sort: c.area },
              share:
                c.share === null
                  ? { display: <MaskedValue />, sort: null }
                  : { display: percent.format(c.share), sort: c.share },
            },
          }))}
          footer={{
            key: "total",
            cells: {
              name: { display: "Donga", sort: null },
              farms: { display: "295", sort: null },
              area: { display: "538 ha", sort: null },
              share: { display: "48 %", sort: null },
            },
          }}
        />
      </DemoRow>
      <DemoRow label="Secret statistique (MaskedValue) et impression">
        <p className="text-sm">
          Exploitations à Ouaké : <MaskedValue />
        </p>
        <PrintButton />
      </DemoRow>
    </DemoSection>
  );
}
