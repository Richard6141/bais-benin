"use client";

import { SHORT_MESSAGE_MAX, renderMessage, type IndicatorValues } from "@/modules/monitoring/rules";
import { cn } from "@/lib/utils";

interface MessagePreviewProps {
  template: string;
  commune: string;
  /** Valeurs d'exemple ; par défaut, des valeurs de grande taille pour éprouver la limite. */
  indicators?: Partial<IndicatorValues>;
  className?: string;
}

export const PREVIEW_INDICATORS: Partial<IndicatorValues> = {
  temp_max_avg_3d: 38.5,
  temp_max_max_3d: 40,
  temp_min_avg_3d: 24,
  rain_sum_3d: 142,
  rain_sum_7d: 18,
  rain_sum_10d: 2,
  rain_sum_30d: 45,
  rain_max_1d: 104,
  dry_days_consecutive: 16,
  et0_sum_7d: 38,
  water_balance_10d: -52,
  forecast_rain_sum_3d: 96,
  forecast_temp_max_max_3d: 41,
};

// Aperçu du message court tel que le recevra un producteur (SMS, WhatsApp), avec compteur :
// au-delà de 160 caractères, l'enregistrement est refusé par le serveur.
export function MessagePreview({
  template,
  commune,
  indicators = PREVIEW_INDICATORS,
  className,
}: MessagePreviewProps) {
  const rendered = renderMessage(template, indicators, { commune });
  const length = rendered.length;
  const tooLong = length > SHORT_MESSAGE_MAX;
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border bg-muted/40 p-3", className)}>
      <p className="text-xs font-medium text-muted-foreground">Aperçu pour {commune}</p>
      <p className="text-sm">{rendered}</p>
      <p
        className={cn(
          "tabular text-xs",
          tooLong ? "font-semibold text-destructive" : "text-muted-foreground",
        )}
        aria-live="polite"
      >
        {length} / {SHORT_MESSAGE_MAX} caractères{tooLong ? " : trop long" : ""}
      </p>
    </div>
  );
}
