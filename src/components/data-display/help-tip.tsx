"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Aide contextuelle en infobulle « ? », placée à côté d'un libellé : règle de l'interface, l'aide
// n'est jamais une description sous le champ. Le bouton reste accessible au clavier et au lecteur
// d'écran (son nom annonce l'aide, le contenu s'affiche au survol ou au focus).
export function HelpTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Aide : ${label}`}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] leading-none font-semibold text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          ?
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{children}</TooltipContent>
    </Tooltip>
  );
}
