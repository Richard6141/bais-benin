"use client";

import { CheckCircle2, MapPin, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Route } from "next";
import { describeLocateError, type GeoPosition } from "@/components/forms/location-picker";
import { GpsPrecisionHint } from "@/components/forms/gps-precision-hint";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAgentDatabase } from "@/lib/offline/db";
import { estimatePolygonAreaHa } from "@/lib/geo/polygon-area";
import { useSync } from "@/lib/offline/use-sync";
import { browserCaptureCorner, type CornerCaptureFunction } from "./corner-capture";
import { areaGapPercent } from "@/modules/sync/handlers/geometry";
import { buildParcelSurveyCommand, MIN_SURVEY_CORNERS } from "./survey-command";

interface SurveyFormProps {
  userId: string;
  farm: { id: string };
  parcel: { id: string; code: string; declaredAreaHa: number; version: number };
  /** Injectable pour les tests ; par défaut la moyenne de plusieurs lectures du navigateur. */
  captureCorner?: CornerCaptureFunction;
}

const areaFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });

// Relevé de contour à pied (parcours terrain) : l'agent fait le tour de la parcelle et appuie sur
// « Marquer ce coin » à chaque angle. Chaque coin moyenne quelques secondes de lectures GPS pour
// amortir le bruit du signal ; la surface affichée est une estimation, comparée à la déclaration.
export function SurveyForm({
  userId,
  farm,
  parcel,
  captureCorner = browserCaptureCorner,
}: SurveyFormProps) {
  const sync = useSync(userId);
  const [corners, setCorners] = useState<GeoPosition[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const areaHa = corners.length >= MIN_SURVEY_CORNERS ? estimatePolygonAreaHa(corners) : null;
  const gapPercent = areaHa === null ? null : areaGapPercent(parcel.declaredAreaHa, areaHa);

  async function markCorner() {
    setError(null);
    setCapturing(true);
    setSampleCount(0);
    try {
      const position = await captureCorner((count) => setSampleCount(count));
      setCorners((current) => [...current, position]);
    } catch (cause) {
      setError(describeLocateError(cause));
    } finally {
      setCapturing(false);
      setSampleCount(0);
    }
  }

  function removeCorner(index: number) {
    setCorners((current) => current.filter((_, i) => i !== index));
  }

  async function submit() {
    setError(null);
    const built = buildParcelSurveyCommand({
      farmId: farm.id,
      parcelId: parcel.id,
      expectedVersion: parcel.version,
      corners,
    });
    if (!built.ok) {
      setError(built.error);
      return;
    }
    const db = getAgentDatabase(userId);
    await built.enqueue(db);
    setSaved(true);
    if (sync.online) void sync.sync();
  }

  if (saved) {
    return (
      <Card>
        <CardHeader>
          <CheckCircle2 className="size-8 text-success" aria-hidden />
          <CardTitle>Contour enregistré</CardTitle>
          <CardDescription>
            {sync.online
              ? "Il est envoyé au serveur maintenant."
              : "Il partira dès que le réseau reviendra. Vous pouvez continuer votre tournée."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="h-12">
            <Link href={`/agent/exploitations/${farm.id}` as Route}>Voir la fiche</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-24 md:pb-0">
      <Card>
        <CardHeader>
          <CardTitle>Contour de la parcelle {parcel.code}</CardTitle>
          <CardDescription>
            Faites le tour du champ et appuyez sur « Marquer ce coin » à chaque angle, dans
            l&apos;ordre. Trois coins au minimum ferment un contour.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button
            type="button"
            onClick={() => void markCorner()}
            disabled={capturing}
            aria-busy={capturing}
            className="h-14 w-full text-base"
          >
            <MapPin aria-hidden className={capturing ? "animate-pulse" : undefined} />
            {capturing
              ? `Restez immobile, lecture ${sampleCount || 1}`
              : `Marquer ce coin (${corners.length})`}
          </Button>

          {corners.length > 0 ? (
            <ul className="flex flex-col gap-2" aria-label="Coins relevés">
              {corners.map((corner, index) => (
                <li
                  key={index}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-2"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Coin {index + 1}</span>
                    <GpsPrecisionHint accuracyM={corner.accuracyM ?? null} />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Retirer le coin ${index + 1}`}
                    onClick={() => removeCorner(index)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Aucun coin relevé pour l&apos;instant.
            </p>
          )}

          {areaHa !== null ? (
            <p className="tabular text-sm text-muted-foreground">
              Surface estimée : {areaFormatter.format(areaHa)} ha sur{" "}
              {areaFormatter.format(parcel.declaredAreaHa)} ha déclarés
              {gapPercent !== null ? ` (écart de ${gapPercent} %)` : ""}
            </p>
          ) : null}

          {error ? (
            <Alert variant="critical" role="alert">
              <AlertTitle>Impossible de relever ce coin</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t bg-background/95 p-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto flex max-w-6xl gap-2">
          <Button asChild variant="outline" className="h-12">
            <Link href={`/agent/exploitations/${farm.id}` as Route}>Annuler</Link>
          </Button>
          <Button
            className="h-12 flex-1"
            disabled={corners.length < MIN_SURVEY_CORNERS}
            onClick={() => void submit()}
          >
            Terminer le relevé
          </Button>
        </div>
      </div>
    </div>
  );
}
