"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Snap = "peek" | "half" | "full";

/**
 * Hauteur du tiroir replié : la poignée et la première ligne du panneau. La carte réserve la même
 * hauteur sous elle (agri-map.tsx, mb-[8.5rem]) pour que son attribution reste visible.
 */
const DRAWER_PEEK = "8.5rem";

const SNAP_HEIGHT: Record<Snap, string> = {
  peek: DRAWER_PEEK,
  half: "55%",
  full: "calc(100% - 1.5rem)",
};

interface MapPanelDrawerProps {
  /** Nom du panneau pour les lecteurs d'écran. */
  label: string;
  /**
   * Ce que montre le panneau (commune, parcelle) : quand il change pour une valeur, le tiroir
   * s'ouvre à mi-hauteur pour que la fiche se voie sans geste de plus.
   */
  expandKey: string | null;
  children: ReactNode;
}

// Panneau de lecture de la carte. Sur grand écran, une colonne de hauteur bornée qui défile seule.
// Sur téléphone et tablette, un tiroir posé sur le bas de la carte : replié, il montre la première
// ligne du panneau ; on le tire vers le haut ou on touche sa poignée pour l'ouvrir. Trois crans
// (replié, mi-hauteur, presque plein écran) ; le relâchement se cale sur le plus proche.
export function MapPanelDrawer({ label, expandKey, children }: MapPanelDrawerProps) {
  const [snap, setSnap] = useState<{ value: Snap; key: string | null }>({
    value: "peek",
    key: expandKey,
  });
  // Ajustement pendant le rendu (et non dans un effet) quand la fiche affichée change.
  if (snap.key !== expandKey) {
    setSnap({ value: expandKey ? "half" : snap.value, key: expandKey });
  }
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null);
  const asideRef = useRef<HTMLElement>(null);

  const setValue = (value: Snap) => setSnap((current) => ({ ...current, value }));

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    const aside = asideRef.current;
    if (!aside) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startY: event.clientY, startHeight: aside.offsetHeight, moved: false };
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    const container = asideRef.current?.parentElement;
    if (!state || !container) return;
    const delta = state.startY - event.clientY;
    if (Math.abs(delta) > 6) state.moved = true;
    if (!state.moved) return;
    const max = container.clientHeight - 24;
    setDragHeight(Math.min(max, Math.max(96, state.startHeight + delta)));
  };

  const onPointerUp = () => {
    const state = drag.current;
    const aside = asideRef.current;
    const container = aside?.parentElement;
    drag.current = null;
    if (!state || !aside || !container) return;
    if (!state.moved) {
      setValue(snap.value === "peek" ? "half" : "peek");
      return;
    }
    // Cran le plus proche de la hauteur relâchée.
    const height = aside.offsetHeight;
    const total = container.clientHeight;
    const candidates: [Snap, number][] = [
      ["peek", 136],
      ["half", total * 0.55],
      ["full", total - 24],
    ];
    const nearest = candidates.reduce((best, candidate) =>
      Math.abs(candidate[1] - height) < Math.abs(best[1] - height) ? candidate : best,
    );
    setValue(nearest[0]);
    setDragHeight(null);
  };

  const open = snap.value !== "peek";
  const height = dragHeight !== null ? `${dragHeight}px` : SNAP_HEIGHT[snap.value];

  return (
    <aside
      ref={asideRef}
      aria-label={label}
      style={{ "--drawer-h": height } as React.CSSProperties}
      className={cn(
        "absolute inset-x-0 bottom-0 z-20 flex h-[var(--drawer-h)] flex-col rounded-t-lg border-t bg-background shadow-overlay",
        dragHeight === null && "transition-[height] duration-200 ease-brand",
        "lg:static lg:z-auto lg:h-auto lg:min-h-0 lg:rounded-none lg:border-t-0 lg:border-l lg:shadow-none lg:transition-none",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Réduire le panneau" : "Agrandir le panneau"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setValue(open ? "peek" : "half");
          }
        }}
        className="flex h-7 w-full shrink-0 touch-none items-center justify-center rounded-t-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset lg:hidden"
      >
        <span className="h-1 w-10 rounded-full bg-stone-300 dark:bg-stone-600" aria-hidden />
      </button>
      {/* Les panneaux de la carte défilent déjà seuls (h-full, overflow) : ce cadre leur donne une
          hauteur bornée, et ne défile lui-même que pour un contenu qui n'en fait pas autant. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-4 lg:pt-4">
        {children}
      </div>
    </aside>
  );
}
