"use client";

import { CircleHelp } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface HelpTipProps {
  /** Nom de ce que l'aide explique, lu par les lecteurs d'écran : « Aide : <label> ». */
  label: string;
  children: ReactNode;
  className?: string;
}

// Petite aide « ? » à côté d'un libellé : l'explication reste hors de la page tant qu'on ne la
// demande pas, pour garder les formulaires et les fiches courts. S'ouvre au survol de la souris et
// au toucher (une infobulle seule ne s'ouvrirait pas sur un téléphone).
export function HelpTip({ label, children, className }: HelpTipProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        aria-label={`Aide : ${label}`}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setOpen(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setOpen(false);
        }}
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          className,
        )}
      >
        <CircleHelp className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-72 p-3 text-sm leading-relaxed"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
