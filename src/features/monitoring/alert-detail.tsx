import type { ReactNode } from "react";
import { AlertCard } from "@/components/data-display/alert-card";
import {
  IndicatorExplanation,
  parseExplainedLines,
} from "@/components/data-display/indicator-explanation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AlertDetail } from "@/modules/monitoring";
import { DeliverySummary, toCardData } from "./alert-views";

const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

function formatIndicator(value: unknown): string {
  if (value === null || value === undefined) return "non disponible";
  if (typeof value === "number") return number.format(value);
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

interface AlertDetailViewProps {
  alert: AlertDetail;
  /** Affiche la règle, sa version et les indicateurs bruts (fiche ministère). */
  audit?: boolean;
  /** Emplacement des exploitations concernées (fiche agent). */
  farmsSlot?: ReactNode;
}

// Fiche d'alerte pour les rôles qui encadrent (agent, ministère) : l'alerte, pourquoi elle a été
// levée, comment elle a été diffusée ; en mode audit, la règle et les indicateurs lus.
export function AlertDetailView({ alert, audit = false, farmsSlot }: AlertDetailViewProps) {
  const indicators = Object.entries(alert.indicators ?? {});
  return (
    <div className="flex flex-col gap-6">
      <AlertCard alert={toCardData(alert)} variant="full" />

      <Card>
        <CardHeader>
          <CardTitle>Pourquoi cette alerte</CardTitle>
          {audit ? (
            <CardDescription>
              Règle <span className="font-mono">{alert.ruleCode}</span>, version {alert.ruleVersion}
              {alert.resolvedReason ? `, levée : ${alert.resolvedReason}` : ""}
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          {alert.explanation.length > 0 ? (
            <IndicatorExplanation
              conditions={parseExplainedLines(alert.explanation)}
              title="Conditions de la règle"
            />
          ) : (
            <p className="text-sm text-muted-foreground">Trace de la règle non disponible.</p>
          )}
        </CardContent>
      </Card>

      {audit && indicators.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Indicateurs lus</CardTitle>
            <CardDescription>
              Valeurs utilisées par la règle au moment du déclenchement.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {indicators.map(([code, value]) => (
                <div
                  key={code}
                  className="flex items-baseline justify-between gap-3 border-b py-1 text-sm"
                >
                  <dt className="font-mono text-xs text-muted-foreground">{code}</dt>
                  <dd className="tabular font-medium">{formatIndicator(value)}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      ) : null}

      <DeliverySummary rows={alert.delivery} />

      {farmsSlot ?? null}
    </div>
  );
}
