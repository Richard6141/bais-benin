import { NoValue } from "@/components/data-display/no-value";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MAX_RANKING_LIMIT,
  MIN_AREA_FOR_YIELD_HA,
  type ProducerRanking,
} from "@/modules/analytics";

const tonnes = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const hectares = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const yields = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const selectClass =
  "h-11 w-full rounded-sm border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const LIMITS = [10, 50, 100, 200, MAX_RANKING_LIMIT] as const;

interface FiltersProps {
  ranking: ProducerRanking;
  crops: ReadonlyArray<{ code: string; nameFr: string }>;
  campaigns: ReadonlyArray<{ code: string; status: string }>;
  departements: ReadonlyArray<{ code: string; name: string }>;
}

// Filtres en formulaire GET : l'adresse porte toujours le classement affiché, qu'on peut
// partager ou exporter tel quel.
export function ProducerRankingFilters({ ranking, crops, campaigns, departements }: FiltersProps) {
  const f = ranking.filters;
  return (
    <form
      method="get"
      aria-label="Critères du classement"
      className="grid gap-4 rounded-sm border bg-muted/40 p-4 sm:grid-cols-2 lg:grid-cols-3 print:hidden"
    >
      <Field id="culture" label="Culture">
        <select id="culture" name="cropCode" defaultValue={f.cropCode} className={selectClass}>
          {crops.map((crop) => (
            <option key={crop.code} value={crop.code}>
              {crop.nameFr}
            </option>
          ))}
        </select>
      </Field>
      <Field id="campagne" label="Campagne">
        <select
          id="campagne"
          name="campaignCode"
          defaultValue={f.campaignCode}
          className={selectClass}
        >
          {campaigns
            .filter((c) => c.status !== "PLANNED")
            .map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
                {c.status === "OPEN" ? " (en cours)" : ""}
              </option>
            ))}
        </select>
      </Field>
      <Field id="departement" label="Département">
        <select
          id="departement"
          name="departementCode"
          defaultValue={f.departementCode ?? ""}
          className={selectClass}
        >
          <option value="">Tout le Bénin</option>
          {departements.map((d) => (
            <option key={d.code} value={d.code}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="critere" label="Classer par">
        <select id="critere" name="metric" defaultValue={f.metric} className={selectClass}>
          <option value="production">Production totale</option>
          <option value="yield">
            Rendement à l&apos;hectare (au moins {hectares.format(MIN_AREA_FOR_YIELD_HA)} ha)
          </option>
        </select>
      </Field>
      <Field id="verification" label="Récoltes prises en compte">
        <select
          id="verification"
          name="verifiedOnly"
          defaultValue={f.verifiedOnly ? "1" : "0"}
          className={selectClass}
        >
          <option value="1">Exploitations vérifiées seulement</option>
          <option value="0">Toutes, vérifiées ou non</option>
        </select>
      </Field>
      <Field id="nombre" label="Nombre de producteurs">
        <select id="nombre" name="limit" defaultValue={String(f.limit)} className={selectClass}>
          {LIMITS.map((n) => (
            <option key={n} value={n}>
              {n} premiers
            </option>
          ))}
        </select>
      </Field>
      <div className="sm:col-span-2 lg:col-span-3">
        <Button type="submit" className="h-11">
          Afficher le classement
        </Button>
      </div>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children}
    </div>
  );
}

export function ProducerRankingTable({
  ranking,
  cropName,
}: {
  ranking: ProducerRanking;
  cropName: string;
}) {
  if (ranking.rows.length === 0) {
    return (
      <p className="rounded-sm border bg-muted/40 p-4 text-sm">
        Aucune récolte de {cropName.toLowerCase()} déclarée pour la campagne {ranking.campaign.code}{" "}
        avec ces critères.
        {ranking.filters.verifiedOnly
          ? " Essayez en incluant les exploitations non encore vérifiées."
          : ""}
      </p>
    );
  }
  const byYield = ranking.filters.metric === "yield";
  return (
    <div className="overflow-x-auto rounded-sm border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14 text-right">Rang</TableHead>
            <TableHead>Producteur</TableHead>
            <TableHead>Commune</TableHead>
            <TableHead className="text-right">Exploitations</TableHead>
            <TableHead className="text-right">Surface (ha)</TableHead>
            <TableHead className={byYield ? "text-right" : "text-right font-bold"}>
              Production (t)
            </TableHead>
            <TableHead className={byYield ? "text-right font-bold" : "text-right"}>
              Rendement (t/ha)
            </TableHead>
            <TableHead>Téléphone</TableHead>
            <TableHead>Vérification</TableHead>
            <TableHead>Palmarès public</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ranking.rows.map((row) => (
            <TableRow key={row.farmerId}>
              <TableCell className="tabular text-right font-bold">{row.rank}</TableCell>
              <TableCell>
                <span className="block font-medium">{row.farmerName}</span>
                <span className="block font-mono text-xs text-muted-foreground">
                  {row.farmerCode}
                </span>
              </TableCell>
              <TableCell>
                <span className="block">{row.communeName}</span>
                <span className="block text-xs text-muted-foreground">{row.departementName}</span>
              </TableCell>
              <TableCell className="tabular text-right">{row.farmCount}</TableCell>
              <TableCell className="tabular text-right">{hectares.format(row.areaHa)}</TableCell>
              <TableCell className="tabular text-right">{tonnes.format(row.productionT)}</TableCell>
              <TableCell className="tabular text-right">
                {row.yieldTPerHa === null ? <NoValue /> : yields.format(row.yieldTPerHa)}
              </TableCell>
              <TableCell className="tabular text-sm whitespace-nowrap">
                {row.phone ?? <NoValue />}
              </TableCell>
              <TableCell>
                <Badge variant={row.verified ? "success" : "outline"}>
                  {row.verified ? "Vérifiée" : "Déclarée"}
                </Badge>
              </TableCell>
              <TableCell className="text-sm whitespace-nowrap">
                {row.publicConsent ? "Accord donné" : "Sans accord"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
