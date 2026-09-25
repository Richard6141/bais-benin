"use client";

import { LocateFixed, MapPin } from "lucide-react";
import { useState } from "react";
import { GpsPrecisionHint } from "@/components/forms/gps-precision-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface GeoPosition {
  lng: number;
  lat: number;
  accuracyM?: number;
}

export type LocateFunction = () => Promise<GeoPosition>;

interface LocationPickerProps {
  value: GeoPosition | null;
  onChange: (position: GeoPosition) => void;
  /** Injectable pour les tests ; par défaut la géolocalisation du navigateur en haute précision. */
  locate?: LocateFunction;
  /** Libellé lisible de la position (« Djougou, Donga »), fourni par le parent qui connaît le territoire. */
  label?: string | null;
  className?: string;
}

// Messages par code d'erreur de l'API Geolocation (1 refus, 2 indisponible, 3 délai). Chaque
// message donne l'action à faire ; la saisie manuelle reste toujours possible.
const GEOLOCATION_MESSAGES: Record<number, string> = {
  1: "Autorisez la localisation dans les réglages du téléphone, ou saisissez la position.",
  2: "Position indisponible : sortez à découvert et réessayez.",
  3: "La position met trop de temps à arriver : réessayez ou saisissez-la.",
};

export function describeLocateError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null ? (error as { code?: number }).code : undefined;
  return (code !== undefined && GEOLOCATION_MESSAGES[code]) || GEOLOCATION_MESSAGES[2] || "";
}

export const browserLocate: LocateFunction = () =>
  new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject({ code: 2 });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lng: position.coords.longitude,
          lat: position.coords.latitude,
          accuracyM: position.coords.accuracy,
        }),
      reject,
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });

const coordinateFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 5 });

// Position d'un siège d'exploitation : un seul grand bouton « Utiliser ma position », la précision
// affichée en clair, et une saisie manuelle repliée pour les téléphones sans GPS.
export function LocationPicker({
  value,
  onChange,
  locate = browserLocate,
  label,
  className,
}: LocationPickerProps) {
  const [status, setStatus] = useState<"idle" | "locating" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ lat: "", lng: "" });

  async function handleLocate() {
    setStatus("locating");
    setError(null);
    try {
      const position = await locate();
      onChange(position);
      setStatus("idle");
    } catch (cause) {
      setError(describeLocateError(cause));
      setStatus("error");
    }
  }

  function handleManualSubmit() {
    const lat = Number.parseFloat(manual.lat.replace(",", "."));
    const lng = Number.parseFloat(manual.lng.replace(",", "."));
    // Le Bénin tient entre 6° et 12,5° de latitude nord et 0,7° et 4° de longitude est.
    if (Number.isNaN(lat) || Number.isNaN(lng) || lat < 6 || lat > 12.5 || lng < 0.7 || lng > 4) {
      setError(
        "Ces coordonnées sont hors du Bénin : vérifiez latitude (6 à 12,5) et longitude (0,7 à 4).",
      );
      return;
    }
    setError(null);
    onChange({ lat, lng });
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Button
        type="button"
        onClick={handleLocate}
        disabled={status === "locating"}
        aria-busy={status === "locating"}
        className="h-14 w-full text-base"
      >
        <LocateFixed aria-hidden className={status === "locating" ? "animate-pulse" : undefined} />
        {status === "locating" ? "Recherche de la position…" : "Utiliser ma position"}
      </Button>

      {value ? (
        <div
          className="flex flex-col gap-1 rounded-lg border bg-card p-3"
          data-slot="location-summary"
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <MapPin aria-hidden className="size-4 text-primary" />
            {label ?? "Position enregistrée"}
          </p>
          <p className="tabular text-xs text-muted-foreground">
            {coordinateFormatter.format(value.lat)} N, {coordinateFormatter.format(value.lng)} E
          </p>
          <GpsPrecisionHint accuracyM={value.accuracyM ?? null} />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="self-start text-sm text-primary underline-offset-4 hover:underline"
        aria-expanded={manualOpen}
        onClick={() => setManualOpen((open) => !open)}
      >
        {manualOpen ? "Masquer la saisie manuelle" : "Saisir la position à la main"}
      </button>

      {manualOpen ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="location-lat">Latitude</Label>
            <Input
              id="location-lat"
              inputMode="decimal"
              placeholder="9,70"
              value={manual.lat}
              onChange={(event) => setManual({ ...manual, lat: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="location-lng">Longitude</Label>
            <Input
              id="location-lng"
              inputMode="decimal"
              placeholder="1,67"
              value={manual.lng}
              onChange={(event) => setManual({ ...manual, lng: event.target.value })}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="col-span-2 h-11"
            onClick={handleManualSubmit}
          >
            Utiliser ces coordonnées
          </Button>
        </div>
      ) : null}
    </div>
  );
}
