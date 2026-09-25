import { Phone, PhoneOff } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AffectedFarm } from "@/modules/monitoring/delivery";
import { RELAY_MODE_LABELS, RelayAlertButton } from "./relay";
import { CHANNEL_LABELS } from "./monitoring-logic";

// B2 « Exploitations concernées » : qui appeler ou visiter. La liste arrive triée par le service
// (sans téléphone, échec d'envoi, non lu, puis lu ou relayé) ; l'écran ne fait que l'afficher.

const CHANNEL_STATUS: Record<
  string,
  { label: string; variant: "success" | "info" | "watch" | "critical" | "outline" }
> = {
  PENDING: { label: "en attente", variant: "outline" },
  SENT: { label: "envoyé", variant: "info" },
  DELIVERED: { label: "remis", variant: "info" },
  READ: { label: "lu", variant: "success" },
  FAILED: { label: "échec", variant: "critical" },
  RELAYED: { label: "prévenu par l'agent", variant: "success" },
  SKIPPED: { label: "non envoyé", variant: "outline" },
};

const ATTENTION_LABELS = {
  NO_PHONE: "Sans téléphone",
  DELIVERY_FAILED: "Message en échec",
  UNREAD: "Pas encore lu",
} as const;

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

interface AffectedFarmsProps {
  farms: readonly AffectedFarm[];
  alertId: string;
  userId: string;
}

export function AffectedFarms({ farms, alertId, userId }: AffectedFarmsProps) {
  const noPhone = farms.filter((farm) => !farm.hasPhone).length;
  return (
    <section aria-labelledby="affected-title" className="flex flex-col gap-3">
      <h2 id="affected-title" className="text-lg font-semibold">
        Exploitations concernées{" "}
        <span className="tabular text-base font-normal text-muted-foreground">{farms.length}</span>
      </h2>
      {noPhone > 0 ? (
        <p className="text-sm">
          {noPhone} producteur{noPhone > 1 ? "s n'ont" : " n'a"} pas de téléphone : prévenez-les
          lors de votre tournée.
        </p>
      ) : null}
      {farms.length === 0 ? (
        <EmptyState
          title="Aucune exploitation concernée"
          description="La règle ne vise aucune exploitation de la commune."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {farms.map((farm) => (
            <li
              key={farm.farmId}
              className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{farm.farmerName}</span>
                  {farm.attention ? (
                    <Badge variant={farm.attention === "UNREAD" ? "watch" : "warning"}>
                      {ATTENTION_LABELS[farm.attention]}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  <span className="font-mono text-xs">{farm.farmCode}</span>
                  {farm.village ? ` · ${farm.village}` : ""}
                </p>
                <p className="flex flex-wrap gap-1.5">
                  {Object.entries(farm.channels).map(([channel, status]) => {
                    const info = CHANNEL_STATUS[status ?? ""] ?? {
                      label: status ?? "",
                      variant: "outline" as const,
                    };
                    return (
                      <Badge key={channel} variant={info.variant}>
                        {CHANNEL_LABELS[channel] ?? channel} : {info.label}
                      </Badge>
                    );
                  })}
                </p>
                {farm.relay ? (
                  <p className="text-xs text-muted-foreground">
                    Prévenu
                    {farm.relay.mode
                      ? ` (${RELAY_MODE_LABELS[farm.relay.mode as keyof typeof RELAY_MODE_LABELS] ?? farm.relay.mode})`
                      : ""}
                    {farm.relay.byName ? ` par ${farm.relay.byName}` : ""}
                    {farm.relay.at ? ` le ${dateFormatter.format(farm.relay.at)}` : ""}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2">
                {farm.phone ? (
                  <Button asChild variant="outline" className="h-11">
                    <a href={`tel:${farm.phone}`}>
                      <Phone aria-hidden />
                      Appeler
                    </a>
                  </Button>
                ) : !farm.hasPhone ? (
                  <span className="inline-flex h-11 items-center gap-1.5 text-sm text-muted-foreground">
                    <PhoneOff aria-hidden className="size-4" />
                    Pas de numéro
                  </span>
                ) : null}
                <RelayAlertButton
                  userId={userId}
                  alertId={alertId}
                  farmId={farm.farmId}
                  farmLabel={farm.farmerName}
                  relayed={farm.relay !== null}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
