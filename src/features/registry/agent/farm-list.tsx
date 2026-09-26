import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { CropGlyph, type CropCode, CROP_CODES } from "@/components/data-display/crop-glyph";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card } from "@/components/ui/card";
import type { FarmListItem } from "@/modules/registry";
import { formatDate, formatHa } from "./labels";
import { VerificationStatusBadge } from "./status-badge";

interface FarmListProps {
  items: FarmListItem[];
  emptyTitle?: string;
  emptyDescription?: string;
  hrefFor?: (farm: FarmListItem) => string;
}

function knownCrops(codes: string[]): CropCode[] {
  return codes.filter((code): code is CropCode => (CROP_CODES as readonly string[]).includes(code));
}

// Liste d'exploitations : une carte par ligne, lisible d'une main, mêmes informations
// sur téléphone et sur grand écran (pas de tableau caché derrière un défilement horizontal).
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
    <ul className="flex flex-col gap-2">
      {items.map((farm) => {
        const href = (hrefFor ? hrefFor(farm) : `/agent/exploitations/${farm.id}`) as Route;
        const crops = knownCrops(farm.cropCodes).slice(0, 4);
        return (
          <li key={farm.id}>
            <Card className="p-0">
              <Link
                href={href}
                className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/60 focus-visible:bg-accent/60"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold break-words">{farm.farmer.displayName}</span>
                    <VerificationStatusBadge status={farm.verificationStatus} />
                  </div>
                  <p className="mt-0.5 text-sm break-words text-muted-foreground">
                    <span className="font-mono text-xs">{farm.code}</span> ({farm.commune.name}
                    {farm.village ? `, ${farm.village}` : ""})
                  </p>
                  <p className="tabular mt-1 text-sm">
                    {formatHa(farm.declaredAreaHa)} déclarés
                    {farm.computedAreaHa !== null
                      ? `, ${formatHa(farm.computedAreaHa)} mesurés`
                      : ""}
                    , {farm.parcelCount} parcelle{farm.parcelCount > 1 ? "s" : ""}
                  </p>
                </div>
                <div className="hidden items-center gap-1 sm:flex" aria-hidden>
                  {crops.map((code) => (
                    <CropGlyph key={code} code={code} size={24} />
                  ))}
                </div>
                <div className="hidden text-right text-xs text-muted-foreground lg:block">
                  <p>Mise à jour</p>
                  <p>{formatDate(farm.updatedAt)}</p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
