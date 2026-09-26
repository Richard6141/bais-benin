"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { HelpTip } from "@/components/forms/help-tip";
import { LocationPicker, type GeoPosition } from "@/components/forms/location-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAgentDatabase } from "@/lib/offline/db";
import { useSync } from "@/lib/offline/use-sync";
import { cn } from "@/lib/utils";
import { LAND_COVER_LABELS, type LandCover } from "./labels";
import { MAX_DISTANCE_M, buildSurveyCommand, distanceM } from "./survey-command";

const CHOICES: LandCover[] = ["CROP", "FALLOW", "NATURAL", "WATER", "BUILT", "INACCESSIBLE"];

interface SurveyPointFormProps {
  userId: string;
  point: { id: string; code: string; latitude: number; longitude: number; communeName: string };
  crops: { code: string; name: string }[];
}

const coordinate = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 5 });

// Constat d'un point d'enquête (ADR-0033) : l'agent se rend au point, prend sa position, dit ce
// qu'il voit au point même. Tout part dans l'outbox et suit la prochaine synchronisation.
export function SurveyPointForm({ userId, point, crops }: SurveyPointFormProps) {
  const sync = useSync(userId);
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [landCover, setLandCover] = useState<LandCover | null>(null);
  const [cropCode, setCropCode] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const distance = position
    ? Math.round(distanceM(position, { lat: point.latitude, lng: point.longitude }))
    : null;

  async function submit() {
    setError(null);
    const built = buildSurveyCommand({ point, landCover, cropCode, reason, position });
    if (!built.ok) {
      setError(built.error);
      return;
    }
    await built.enqueue(getAgentDatabase(userId));
    setSaved(true);
    if (sync.online) void sync.sync();
  }

  if (saved) {
    return (
      <Card>
        <CardHeader>
          <CheckCircle2 className="size-8 text-success" aria-hidden />
          <CardTitle>Point {point.code} enregistré</CardTitle>
          <CardDescription>
            {sync.online
              ? "Le constat est envoyé au serveur maintenant."
              : "Il partira dès que le réseau reviendra. Vous pouvez passer au point suivant."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="h-12">
            <Link href="/agent/sondage">Point suivant</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-1">
            <CardTitle>Se rendre au point</CardTitle>
            <HelpTip label="Se rendre au point">
              Le point a été tiré au hasard sur le territoire : il ne désigne aucun producteur.
              Approchez-vous à moins de {MAX_DISTANCE_M} m, puis prenez votre position. Si le point
              ne peut pas être atteint, choisissez « Inaccessible » et dites pourquoi.
            </HelpTip>
          </div>
          <CardDescription>
            {point.communeName}, latitude {coordinate.format(point.latitude)}, longitude{" "}
            {coordinate.format(point.longitude)}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild variant="outline" className="h-12">
            <a
              href={`geo:${point.latitude},${point.longitude}?q=${point.latitude},${point.longitude}`}
            >
              Ouvrir dans l&apos;application de cartes
            </a>
          </Button>
          <LocationPicker value={position} onChange={setPosition} label={point.communeName} />
          {distance !== null ? (
            <p
              className={cn(
                "text-sm font-medium",
                distance <= MAX_DISTANCE_M ? "text-success" : "text-warning",
              )}
            >
              {distance <= MAX_DISTANCE_M
                ? `Vous êtes à ${distance} m du point.`
                : `Vous êtes à ${distance} m du point : approchez-vous encore.`}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-1">
            <CardTitle>Au point même</CardTitle>
            <HelpTip label="Au point même">
              Regardez le sol exactement au point, pas le champ voisin. En cas de cultures
              associées, choisissez celle qui domine au point.
            </HelpTip>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Ce que vous voyez">
            {CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={landCover === choice}
                onClick={() => setLandCover(choice)}
                className={cn(
                  "flex min-h-14 items-center rounded-lg border-2 px-4 py-3 text-left text-sm font-semibold transition-colors",
                  landCover === choice
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-accent",
                )}
              >
                {LAND_COVER_LABELS[choice]}
              </button>
            ))}
          </div>
          {landCover === "CROP" ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="survey-crop">Culture au point</Label>
              <select
                id="survey-crop"
                value={cropCode}
                onChange={(event) => setCropCode(event.target.value)}
                className="h-12 rounded-md border bg-background px-3 text-base"
              >
                <option value="">Choisir</option>
                {crops.map((crop) => (
                  <option key={crop.code} value={crop.code}>
                    {crop.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {landCover === "INACCESSIBLE" ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="survey-reason">Pourquoi</Label>
              <Input
                id="survey-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={200}
                placeholder="ex. rivière en crue"
                className="h-12"
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="critical" role="alert">
          <AlertTitle>Impossible d&apos;enregistrer</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex gap-2">
        <Button asChild variant="outline" className="h-12">
          <Link href="/agent/sondage">Annuler</Link>
        </Button>
        <Button className="h-12 flex-1" onClick={submit}>
          Enregistrer le constat
        </Button>
      </div>
    </div>
  );
}
