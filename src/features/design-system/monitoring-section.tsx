"use client";

import { useState } from "react";
import { AlertCard, type AlertCardData } from "@/components/data-display/alert-card";
import {
  IndicatorExplanation,
  parseExplainedLines,
} from "@/components/data-display/indicator-explanation";
import { RainChart, type RainDay } from "@/components/data-display/rain-chart";
import { SeverityBadge } from "@/components/data-display/severity-badge";
import { WeatherStrip, type WeatherDay } from "@/components/data-display/weather-strip";
import { DemoRow, DemoSection } from "@/features/design-system/demo-section";

// Données de démonstration : fin septembre à Djougou, petite saison sèche qui s'installe au nord.
const ALERT: AlertCardData = {
  title: "Stress hydrique sur les semis de maïs",
  communeName: "Djougou",
  severity: "WARNING",
  category: "WATER_STRESS",
  message: "3 mm de pluie en 10 jours contre 48 mm en moyenne, et 37 °C attendus jeudi.",
  advice: "Différez les semis tardifs, paillez les jeunes plants et arrosez le soir si possible.",
  startsOn: "2026-09-20",
  endsOn: "2026-09-27",
  farmCount: 412,
  hectares: 830,
  source: "Open-Meteo, moteur de règles BAIS",
  sourceDate: "24 sept. 2026",
  readAt: null,
};

const FLOOD: AlertCardData = {
  title: "Risque de crue dans la vallée de l'Ouémé",
  communeName: "Adjohoun",
  severity: "CRITICAL",
  category: "FLOOD",
  message: "Montée des eaux annoncée sous 48 h.",
  advice: "Récoltez ce qui peut l'être et mettez les stocks en hauteur.",
  startsOn: "2026-09-23",
  farmCount: 96,
  source: "Direction générale de l'Eau (démonstration)",
  readAt: "2026-09-24T07:30:00Z",
};

const WEATHER: WeatherDay[] = [
  ["2026-09-19", 32, 22, 6.2, false],
  ["2026-09-20", 33, 22, 0.8, false],
  ["2026-09-21", 34, 23, 0, false],
  ["2026-09-22", 35, 23, 0, false],
  ["2026-09-23", 35, 24, 1.4, false],
  ["2026-09-24", 36, 24, 0, true],
  ["2026-09-25", 37, 24, 0, true],
  ["2026-09-26", 34, 23, 12.5, true],
  ["2026-09-27", 32, 22, 4, true],
].map(([date, tMaxC, tMinC, rainMm, forecast]) => ({
  date: date as string,
  tMaxC: tMaxC as number,
  tMinC: tMinC as number,
  rainMm: rainMm as number,
  forecast: forecast as boolean,
}));

// Trente jours déterministes : pluies d'août qui s'espacent en septembre.
const RAIN: RainDay[] = Array.from({ length: 30 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 7, 29 + index));
  const pattern = [
    14, 0, 6, 22, 0, 0, 3, 11, 0, 0, 8, 0, 0, 0, 2, 0, 9, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 12, 4, 0,
  ];
  return {
    date: date.toISOString().slice(0, 10),
    rainMm: pattern[index] ?? 0,
    forecast: index >= 27,
  };
});

const TRACE = [
  "Cumul de pluie sur 10 jours : 3 mm, seuil < 5 mm (remplie).",
  "Température maximale prévue : 37 °C, seuil ≥ 36 °C (remplie).",
  "Part de maïs semé depuis moins de 30 jours : 41 %, seuil ≥ 25 % (remplie).",
  "Humidité du sol : –, seuil < 20 % (non évaluable).",
];

export function MonitoringSection() {
  const [readAt, setReadAt] = useState<string | null>(null);
  return (
    <DemoSection
      id="monitoring"
      title="Monitoring"
      description="Niveaux d'alerte, cartes d'alerte, météo et explication des règles. Chaque alerte dit ce qui se passe, où, depuis quand, et que faire."
    >
      <DemoRow label="Niveaux d'alerte">
        <SeverityBadge severity="INFO" />
        <SeverityBadge severity="WATCH" />
        <SeverityBadge severity="WARNING" />
        <SeverityBadge severity="CRITICAL" />
      </DemoRow>
      <DemoRow label="Carte d'alerte (fiche et liste)" className="grid gap-4 lg:grid-cols-2">
        <AlertCard
          alert={{ ...ALERT, readAt }}
          onMarkRead={() => setReadAt(new Date().toISOString())}
        />
        <div className="flex flex-col gap-3">
          <AlertCard alert={ALERT} variant="compact" />
          <AlertCard alert={FLOOD} variant="compact" />
        </div>
      </DemoRow>
      <DemoRow label="Carte d'alerte, espace agriculteur" className="block max-w-md">
        <AlertCard alert={ALERT} variant="farmer" onMarkRead={() => undefined} />
      </DemoRow>
      <DemoRow label="Météo de la commune" className="block">
        <WeatherStrip days={WEATHER} source="Open-Meteo" sourceDate="24 sept. 2026" />
      </DemoRow>
      <DemoRow label="Pluie sur 30 jours" className="block">
        <RainChart
          days={RAIN}
          thresholdMm={10}
          thresholdLabel="Pluie utile 10 mm"
          source="Open-Meteo"
        />
      </DemoRow>
      <DemoRow label="Explication de la règle" className="block max-w-xl">
        <IndicatorExplanation conditions={parseExplainedLines(TRACE)} />
      </DemoRow>
    </DemoSection>
  );
}
