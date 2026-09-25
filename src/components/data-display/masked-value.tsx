"use client";

import { LockKeyhole } from "lucide-react";
import {
  MASKED_VALUE_EXPLANATION,
  MASKED_VALUE_LABEL,
} from "@/components/data-display/masked-labels";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface MaskedValueProps {
  className?: string;
}

// Cellule masquée par le secret statistique (docs/06 §3, règle 4). Le déclencheur est un bouton
// pour que l'explication s'ouvre aussi au clavier et au toucher ; le lecteur d'écran lit le
// libellé puis l'explication, sans dépendre de l'info-bulle.
export function MaskedValue({ className }: MaskedValueProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-masked="true"
          aria-label={`${MASKED_VALUE_LABEL}. ${MASKED_VALUE_EXPLANATION}`}
          className={cn(
            "inline-flex min-h-6 items-center gap-1 rounded-sm text-muted-foreground italic underline decoration-dotted underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            className,
          )}
        >
          <LockKeyhole className="size-3.5 shrink-0" aria-hidden />
          {MASKED_VALUE_LABEL}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{MASKED_VALUE_EXPLANATION}</TooltipContent>
    </Tooltip>
  );
}
