import {
  CampaignComparison,
  type CampaignSeries,
} from "@/components/data-display/campaign-comparison";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CampaignComparison as ComparisonData } from "@/modules/analytics";
import { cropLeading, formatTonnes } from "./crop-production";
import { formatHectares } from "./dashboard-logic";
import { ProvenanceNote } from "./provenance";

function seriesOf(
  data: ComparisonData,
  metric: "productionT" | "areaHa",
  format: (value: number) => string,
): CampaignSeries[] {
  return data.crops.map((crop) => ({
    key: crop.cropCode,
    label: crop.cropName,
    leading: cropLeading(crop.cropCode),
    points: crop.points.map((point) => {
      const value = point[metric];
      return {
        campaign: point.campaignCode,
        value: point.masked ? "masked" : value,
        display: value === null ? undefined : format(value),
      };
    }),
  }));
}

// A4 : campagne contre campagne pour les 5 cultures principales. Masqué avec une phrase quand
// une seule campagne a des données : une comparaison sans base n'a pas de sens.
export function CampaignBlock({ data }: { data: ComparisonData }) {
  if (data.campaigns.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        Une seule campagne a des données pour ces filtres : la comparaison apparaîtra à la clôture
        de la campagne suivante.
      </p>
    );
  }
  // Sans aucune récolte déclarée sur la période, l'onglet superficie s'ouvre d'abord.
  const hasProduction = data.crops.some((crop) =>
    crop.points.some((point) => !point.masked && point.productionT !== null),
  );
  return (
    <div className="flex flex-col gap-4">
      <Tabs defaultValue={hasProduction ? "production" : "superficie"}>
        <TabsList aria-label="Indicateur comparé">
          <TabsTrigger value="production" className="min-h-11">
            Production déclarée
          </TabsTrigger>
          <TabsTrigger value="superficie" className="min-h-11">
            Superficie cultivée
          </TabsTrigger>
        </TabsList>
        <TabsContent value="production" className="pt-4">
          <CampaignComparison
            metricLabel="Production déclarée"
            series={seriesOf(data, "productionT", formatTonnes)}
          />
        </TabsContent>
        <TabsContent value="superficie" className="pt-4">
          <CampaignComparison
            metricLabel="Superficie cultivée"
            series={seriesOf(data, "areaHa", formatHectares)}
          />
        </TabsContent>
      </Tabs>
      <ProvenanceNote provenance={data.provenance} />
    </div>
  );
}
