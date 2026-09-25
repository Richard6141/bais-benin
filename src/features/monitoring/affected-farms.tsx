import { Phone, PhoneOff } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AffectedFarm } from "@/modules/monitoring/delivery";
import { RELAY_MODE_LABELS, RelayAlertButton } from "./relay";
import { CHANNEL_LABELS, pageAffected, summarizeAffected, villagesOf } from "./monitoring-logic";

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
  TO_CALL: "À prévenir de vive voix",
  DELIVERY_FAILED: "Message en échec",
  NOT_SENT: "Non envoyé",
  UNREAD: "Pas encore lu",
} as const;

// « Non envoyé » reste neutre : le relais de l'agent est prévu, rien n'a échoué.
const ATTENTION_VARIANTS = {
  NO_PHONE: "warning",
  TO_CALL: "warning",
  DELIVERY_FAILED: "warning",
  NOT_SENT: "outline",
  UNREAD: "watch",
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
  /** Page cumulée (?page=) et village filtré (?village=), lus par la page serveur. */
  page?: number;
  village?: string;
}

const integer = new Intl.NumberFormat("fr-FR");

function hrefWith(alertId: string, params: { page?: number; village?: string }): Route {
  const search = new URLSearchParams();
  if (params.village) search.set("village", params.village);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return `/agent/alertes/${alertId}${query ? `?${query}` : ""}#exploitations` as Route;
}

export function AffectedFarms({ farms, alertId, userId, page, village }: AffectedFarmsProps) {
  const summary = summarizeAffected(farms);
  const villages = villagesOf(farms);
  const selectedVillage = village && villages.some((v) => v.name === village) ? village : undefined;
  const view = pageAffected(farms, { page, village: selectedVillage });
  const figures = [
    { label: "À prévenir de vive voix", value: summary.toTellInPerson, tone: "text-warning" },
    { label: "Échecs d'envoi", value: summary.deliveryFailed, tone: "text-critical" },
    // Canal écarté (mode démonstration, silence nocturne) avec relais prévu : jamais un échec.
    { label: "Non envoyés", value: summary.notSent, tone: "" },
    { label: "Non lus", value: summary.unread, tone: "text-watch" },
    { label: "Relayés", value: summary.relayed, tone: "text-success" },
  ];
  const filters = [{ name: undefined as string | undefined, count: summary.total }, ...villages];
  return (
    <section
      id="exploitations"
      aria-labelledby="affected-title"
      className="flex scroll-mt-24 flex-col gap-4"
    >
      <h2 id="affected-title" className="text-lg font-semibold">
        Exploitations concernées{" "}
        <span className="tabular text-base font-normal text-muted-foreground">
          {integer.format(summary.total)}
        </span>
      </h2>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Résumé de la diffusion">
        {figures.map((figure) => (
          // Cinq chiffres sur deux colonnes : le dernier occupe la ligne entière sur mobile.
          <div
            key={figure.label}
            className="rounded-lg border bg-card p-3 last:col-span-2 sm:last:col-span-1"
          >
            <dt className="text-xs text-muted-foreground">{figure.label}</dt>
            <dd className={cn("tabular text-2xl font-semibold", figure.value > 0 && figure.tone)}>
              {integer.format(figure.value)}
            </dd>
          </div>
        ))}
      </dl>
      {summary.toTellInPerson > 0 ? (
        <p className="text-sm">
          {summary.toTellInPerson === 1
            ? "1 producteur ne sera joint par aucun message"
            : `${summary.toTellInPerson} producteurs ne seront joints par aucun message`}{" "}
          : prévenez-les lors de votre tournée. Ils apparaissent en tête de liste.
        </p>
      ) : null}
      {villages.length > 1 ? (
        <nav aria-label="Filtrer par village" className="-mx-4 overflow-x-auto px-4">
          <ul className="flex gap-2">
            {filters.map((v) => {
              const active = v.name === selectedVillage;
              return (
                <li key={v.name ?? "tous"} className="shrink-0">
                  <Link
                    href={hrefWith(alertId, { village: v.name })}
                    aria-current={active ? "page" : undefined}
                    scroll={false}
                    className={cn(
                      "inline-flex h-11 items-center gap-1.5 rounded-sm border px-4 text-sm font-medium whitespace-nowrap",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-accent",
                    )}
                  >
                    {v.name ?? "Tous les villages"}
                    <span className="tabular text-xs opacity-80">{v.count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
      {farms.length === 0 ? (
        <EmptyState
          title="Aucune exploitation concernée"
          description="La règle ne vise aucune exploitation de la commune."
        />
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Liste des exploitations concernées">
          {view.items.map((farm) => (
            <li
              key={farm.farmId}
              className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{farm.farmerName}</span>
                  {farm.attention ? (
                    <Badge variant={ATTENTION_VARIANTS[farm.attention]}>
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
      {farms.length > 0 ? (
        <div className="flex flex-col items-center gap-2">
          <p className="tabular text-sm text-muted-foreground" aria-live="polite">
            {integer.format(view.shown)} sur {integer.format(view.matching)} affichées
          </p>
          {view.hasMore ? (
            <Button asChild variant="outline" className="h-11">
              <Link
                href={hrefWith(alertId, { village: selectedVillage, page: view.page + 1 })}
                scroll={false}
              >
                Afficher la suite
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
