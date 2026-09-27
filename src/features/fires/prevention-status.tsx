import { Flame } from "lucide-react";
import { HelpTip } from "@/components/forms/help-tip";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { FirePreventionStatus } from "@/modules/fires";

const density = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
/** Communes nommées dans l'encart ; les autres sont comptées. */
const NAMED = 6;

function stateOf(status: FirePreventionStatus): {
  label: string;
  variant: "success" | "watch" | "info";
} {
  if (!status.enabled) return { label: "Coupée", variant: "watch" };
  if (!status.inSeason) return { label: "Hors saison", variant: "info" };
  return { label: "Active", variant: "success" };
}

// Prévention de la saison des feux (ADR-0038 §3, ADR-0039), vue du ministère : interrupteur,
// saison de référence (et celle qui manque, s'il y a lieu) et communes qui recevraient le conseil.
export function FirePreventionPanel({ status }: { status: FirePreventionStatus }) {
  const state = stateOf(status);
  const named = status.communes.slice(0, NAMED).map((commune) => commune.name);
  const others = status.communes.length - named.length;
  return (
    <Card role="region" className="flex flex-col gap-3 p-4" aria-labelledby="prevention-feux">
      <div className="flex flex-wrap items-center gap-2">
        <Flame className="size-5 text-muted-foreground" aria-hidden />
        <h2 id="prevention-feux" className="text-base font-semibold">
          Prévention de la saison des feux
        </h2>
        <Badge variant={state.variant}>{state.label}</Badge>
        <HelpTip label="Prévention de la saison des feux">
          De novembre à avril, chaque lundi, un conseil (« faites vos pare-feu ») peut partir sur
          WhatsApp aux producteurs des communes les plus touchées par les feux, s&apos;ils ont donné
          leur accord. Il reste coupé tant que l&apos;envoi n&apos;a pas été décidé. Les communes
          sont celles du tiers le plus touché, avec au moins 5 feux pour 100 km², sur la saison de
          référence.
        </HelpTip>
      </div>
      <p className="text-sm">
        Référence : <span className="font-semibold">{status.reference.label}</span>
        {status.reference.missingLabel ? (
          <span className="text-muted-foreground">
            {" "}
            ({status.reference.missingLabel} pas encore en base)
          </span>
        ) : null}
      </p>
      <p className="text-sm">
        {status.communes.length === 0
          ? "Aucune commune retenue sur cette saison."
          : `${status.communes.length} commune${status.communes.length > 1 ? "s" : ""} retenue${
              status.communes.length > 1 ? "s" : ""
            } : ${named.join(", ")}${others > 0 ? ` et ${others} autre${others > 1 ? "s" : ""}` : ""}.`}
      </p>
      {status.communes[0] ? (
        <p className="text-xs text-muted-foreground">
          La plus touchée : {status.communes[0].name}, {density.format(status.communes[0].density)}{" "}
          feux pour 100 km².
        </p>
      ) : null}
    </Card>
  );
}
