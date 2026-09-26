"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { FARM_COLORS } from "@/features/agri-map/map-config";
import { useMediaQuery } from "@/lib/use-media-query";
import { VERIFICATION_STATUS_LABELS } from "./labels";
import type { MiniMapFarm } from "./farms-mini-map";

// MapLibre manipule window et WebGL : chargé côté client, et seulement sur grand écran.
const FarmsMiniMap = dynamic(() => import("./farms-mini-map").then((m) => m.FarmsMiniMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

// Colonne de la mini-carte, à côté de la liste sur grand écran (1024 px et plus). Sur téléphone,
// rien n'est chargé : la carte agricole complète reste à un lien.
export function FarmsMapPanel({ farms, total }: { farms: readonly MiniMapFarm[]; total: number }) {
  const wide = useMediaQuery("(min-width: 1024px)");
  if (!wide) return null;
  const missing = total - farms.length;
  return (
    <aside aria-label="Carte des exploitations" className="flex flex-col gap-2">
      <div className="relative h-[26rem] overflow-hidden rounded-lg border">
        <FarmsMiniMap farms={farms} />
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {(Object.keys(FARM_COLORS) as (keyof typeof FARM_COLORS)[]).map((status) => (
          <li key={status} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ background: FARM_COLORS[status] }}
            />
            {VERIFICATION_STATUS_LABELS[status]}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {missing > 0
          ? `${missing} exploitation${missing > 1 ? "s" : ""} de cette page sans position relevée. `
          : ""}
        <Link
          href="/carte"
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          Ouvrir la carte agricole
        </Link>
      </p>
    </aside>
  );
}
