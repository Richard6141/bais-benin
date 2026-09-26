import { ChevronRight, ClipboardCheck, Phone } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import type { FarmListItem } from "@/modules/registry";
import { formatDate, formatHa } from "./labels";
import { VerificationStatusBadge } from "./status-badge";

interface FarmListProps {
  items: FarmListItem[];
  emptyTitle?: string;
  emptyDescription?: string;
  hrefFor?: (farm: FarmListItem) => string;
}

function place(farm: FarmListItem): string {
  return farm.village ? `${farm.village}, ${farm.commune.name}` : farm.commune.name;
}

function parcels(farm: FarmListItem): string {
  const count = `${farm.parcelCount} parcelle${farm.parcelCount > 1 ? "s" : ""}`;
  return `${count}, ${formatHa(farm.computedAreaHa ?? farm.declaredAreaHa)}`;
}

// Liste compacte des exploitations : une ligne par exploitation, avec le producteur, le village,
// les parcelles, le statut et la dernière mise à jour, puis les actions directes (appeler,
// vérifier). Toute la ligne ouvre la fiche ; les actions restent des boutons à part. Sur
// téléphone, les mêmes informations passent sur trois lignes, sans défilement horizontal.
export function FarmList({ items, emptyTitle, emptyDescription, hrefFor }: FarmListProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        title={emptyTitle ?? "Aucune exploitation"}
        description={emptyDescription ?? "Les exploitations de votre périmètre apparaîtront ici."}
      />
    );
  }
  return (
    <ul
      aria-label="Exploitations"
      data-tour="liste-exploitations"
      className="flex flex-col divide-y rounded-lg border bg-card"
    >
      {items.map((farm) => {
        const href = (hrefFor ? hrefFor(farm) : `/agent/exploitations/${farm.id}`) as Route;
        const toVerify =
          farm.verificationStatus === "DECLARED" || farm.verificationStatus === "DISPUTED";
        return (
          <li
            key={farm.id}
            className="relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link
                  href={href}
                  className="font-semibold break-words text-foreground after:absolute after:inset-0 after:rounded-sm focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                >
                  {farm.farmer.displayName}
                </Link>
                <span className="md:hidden">
                  <VerificationStatusBadge status={farm.verificationStatus} />
                </span>
              </div>
              <p className="mt-0.5 text-sm break-words text-muted-foreground">
                <span className="font-mono text-xs">{farm.code}</span>, {place(farm)}
              </p>
              <p className="tabular mt-0.5 text-sm text-muted-foreground md:hidden">
                {parcels(farm)}, mise à jour le {formatDate(farm.updatedAt)}
              </p>
            </div>
            <p className="tabular hidden w-36 shrink-0 text-sm md:block">{parcels(farm)}</p>
            <div className="hidden w-44 shrink-0 md:block">
              <VerificationStatusBadge status={farm.verificationStatus} />
            </div>
            <p className="tabular hidden w-28 shrink-0 text-xs text-muted-foreground xl:block">
              Mise à jour le {formatDate(farm.updatedAt)}
            </p>
            <div className="relative z-10 flex shrink-0 items-center gap-1">
              {farm.farmer.phone ? (
                <Button asChild variant="ghost" size="icon" className="text-muted-foreground">
                  <a
                    href={`tel:${farm.farmer.phone}`}
                    aria-label={`Appeler ${farm.farmer.displayName}`}
                  >
                    <Phone aria-hidden />
                  </a>
                </Button>
              ) : null}
              {toVerify ? (
                <Button asChild variant="outline" size="sm" className="h-11 md:h-8">
                  <Link
                    href={`/agent/verification/${farm.id}` as Route}
                    aria-label={`Vérifier l'exploitation de ${farm.farmer.displayName}`}
                  >
                    <ClipboardCheck aria-hidden />
                    <span className="hidden sm:inline">Vérifier</span>
                  </Link>
                </Button>
              ) : null}
              <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
