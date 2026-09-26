"use client";

import { ChevronUp, Layers } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface MapLayersSheetProps {
  /** Réglages actifs hors valeur par défaut (fond, feux, filtres) : pastille sur le bouton. */
  activeCount: number;
  children: ReactNode;
  className?: string;
}

// Téléphone et tablette : un seul bouton « Couches » posé sur la carte, qui ouvre depuis le bas le
// fond de carte, les feux et les filtres avancés. La carte garde tout l'écran tant qu'on ne règle
// rien.
export function MapLayersSheet({ activeCount, children, className }: MapLayersSheetProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-11 items-center gap-2 rounded-full border bg-card px-4 text-sm font-semibold shadow-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          className,
        )}
      >
        <Layers className="size-4" aria-hidden />
        Couches
        {activeCount > 0 ? (
          <span className="tabular flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
            {activeCount}
          </span>
        ) : null}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85svh] rounded-t-lg">
          <SheetHeader className="border-b">
            <SheetTitle>Couches et filtres</SheetTitle>
            <SheetDescription>Le fond de carte, les feux et les filtres avancés.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {children}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

// Légende repliée en une ligne en bas à gauche de la carte ; dépliée, elle s'ouvre au-dessus du
// bouton, bornée en hauteur pour ne jamais couvrir toute la carte.
export function MapLegendToggle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2", className)}>
      {open ? (
        <div
          id="legende-carte"
          className="flex max-h-[45svh] w-64 max-w-full flex-col gap-2 overflow-y-auto"
        >
          {children}
        </div>
      ) : null}
      <button
        type="button"
        aria-expanded={open}
        aria-controls="legende-carte"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-semibold shadow-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Légende
        <ChevronUp
          className={cn("size-4 transition-transform", !open && "rotate-180")}
          aria-hidden
        />
      </button>
    </div>
  );
}
