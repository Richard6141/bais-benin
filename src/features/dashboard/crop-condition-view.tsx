import type { Route } from "next";
import Link from "next/link";
import { HelpTip } from "@/components/forms/help-tip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ConditionBreakdown, ConditionClass, CropConditionCrop } from "@/modules/analytics";

// État des cultures : une carte par culture (répartition de la surface observée entre bon, moyen,
// faible et à vérifier), puis le détail par département de la culture choisie.

const CLASSES: ReadonlyArray<{
  key: Exclude<ConditionClass, "UNOBSERVED">;
  label: string;
  bar: string;
}> = [
  { key: "GOOD", label: "Bon", bar: "bg-forest" },
  { key: "FAIR", label: "Moyen", bar: "bg-watch" },
  { key: "POOR", label: "Faible", bar: "bg-laterite" },
  { key: "TO_VERIFY", label: "À vérifier", bar: "bg-critical" },
];

const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
const hectares = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("fr-FR");

function observedArea(b: ConditionBreakdown): number {
  return b.areaHa - b.byClass.UNOBSERVED.areaHa;
}

function share(b: ConditionBreakdown, key: ConditionClass): number {
  const observed = observedArea(b);
  return observed > 0 ? b.byClass[key].areaHa / observed : 0;
}

export function ConditionBar({
  breakdown,
  className,
}: {
  breakdown: ConditionBreakdown;
  className?: string;
}) {
  const label = CLASSES.map((c) => `${c.label} ${percent.format(share(breakdown, c.key))}`).join(
    ", ",
  );
  return (
    <div
      className={cn("flex h-2.5 w-full overflow-hidden rounded-sm bg-muted", className)}
      role="img"
      aria-label={label}
    >
      {CLASSES.map((c) => {
        const width = share(breakdown, c.key) * 100;
        return width > 0 ? (
          <span key={c.key} className={c.bar} style={{ width: `${width}%` }} />
        ) : null;
      })}
    </div>
  );
}

export function ConditionLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {CLASSES.map((c) => (
        <li key={c.key} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("inline-block size-2.5 rounded-sm", c.bar)} />
          {c.label}
        </li>
      ))}
    </ul>
  );
}

export function CropConditionCards({
  crops,
  selected,
  hrefFor,
}: {
  crops: readonly CropConditionCrop[];
  selected: string | null;
  hrefFor: (code: string) => string;
}) {
  // Cultures jugées d'abord (par surface jugée), puis celles dont la saison n'est pas encore jugée.
  const ordered = [...crops].sort((a, b) => observedArea(b.national) - observedArea(a.national));
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {ordered.map((crop) => {
        const b = crop.national;
        const judged = b.parcels - b.byClass.UNOBSERVED.parcels;
        const active = crop.code === selected;
        return (
          <li key={crop.code}>
            <Link
              href={hrefFor(crop.code) as Route}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex h-full flex-col gap-2.5 rounded-sm border bg-card p-4 transition-colors hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                active && "border-primary ring-1 ring-primary",
              )}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{crop.name}</span>
                <span className="tabular text-xs whitespace-nowrap text-muted-foreground">
                  {judged > 0
                    ? `${integer.format(judged)} parcelles, ${hectares.format(observedArea(b))} ha`
                    : `${integer.format(b.parcels)} parcelles`}
                </span>
              </span>
              {judged > 0 ? (
                <>
                  <ConditionBar breakdown={b} />
                  <span className="tabular grid grid-cols-3 gap-2 text-sm">
                    {CLASSES.slice(0, 3).map((c) => (
                      <span key={c.key} className="flex flex-col">
                        <span className="text-xs text-muted-foreground">{c.label}</span>
                        <strong>{percent.format(share(b, c.key))}</strong>
                      </span>
                    ))}
                  </span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Saison en cours, pas encore jugée
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function CropConditionTable({ crop }: { crop: CropConditionCrop }) {
  return (
    <div className="overflow-x-auto rounded-sm border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Département</TableHead>
            <TableHead className="w-[32%] min-w-40">Répartition</TableHead>
            {CLASSES.map((c) => (
              <TableHead key={c.key} className="text-right">
                {c.label}
              </TableHead>
            ))}
            <TableHead className="text-right">Surface observée (ha)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {crop.departements.map((dep) => (
            <TableRow key={dep.code}>
              <TableCell className="font-medium">{dep.name}</TableCell>
              {dep.breakdown ? (
                <>
                  <TableCell>
                    <ConditionBar breakdown={dep.breakdown} />
                  </TableCell>
                  {CLASSES.map((c) => (
                    <TableCell key={c.key} className="tabular text-right">
                      {percent.format(share(dep.breakdown!, c.key))}
                    </TableCell>
                  ))}
                  <TableCell className="tabular text-right">
                    {hectares.format(observedArea(dep.breakdown))}
                  </TableCell>
                </>
              ) : (
                <TableCell colSpan={CLASSES.length + 2} className="text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    Moins de 5 parcelles observées
                    <HelpTip label="Secret statistique">
                      Sous 5 parcelles, la répartition permettrait de reconnaître des producteurs :
                      elle n&apos;est pas publiée.
                    </HelpTip>
                  </span>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
