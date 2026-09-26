"use client";

import { Camera, LocateFixed, Send } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAgentDatabase } from "@/lib/offline/db";
import { getDeviceId } from "@/lib/offline/device-id";
import { enqueueCommand } from "@/lib/offline/outbox";
import { syncOnce } from "@/lib/offline/sync-runner";
import { cn } from "@/lib/utils";
import type { FieldReportType, ReportableFarm } from "@/modules/reports";
import { REPORT_TYPE_LABELS } from "./labels";
import { compressPhoto, type CompressedPhoto } from "./photo-compress";

interface ReportFormProps {
  /** Compte connecté : la file d'attente locale lui est propre. */
  userId: string;
  farms: readonly ReportableFarm[];
  cropNames: Readonly<Record<string, string>>;
}

type Stage = "editing" | "saving" | "queued" | "sent";

// Signaler un problème sur une parcelle (phase 0) : quoi, où, une phrase, une photo si possible.
// La saisie part dans la file d'attente de l'appareil : elle est envoyée tout de suite s'il y a du
// réseau, sinon au retour du réseau. La position est celle de la parcelle, sauf si le producteur
// préfère celle de son téléphone (sur place, au bord du champ).
export function ReportForm({ userId, farms, cropNames }: ReportFormProps) {
  const [farmId, setFarmId] = useState(farms[0]?.id ?? "");
  const farm = farms.find((f) => f.id === farmId);
  const [parcelId, setParcelId] = useState(farm?.parcels[0]?.id ?? "");
  const parcel = farm?.parcels.find((p) => p.id === parcelId);
  const [type, setType] = useState<FieldReportType | null>(null);
  const [cropCode, setCropCode] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [gps, setGps] = useState<{ point: [number, number]; accuracyM: number } | null>(null);
  const [photo, setPhoto] = useState<CompressedPhoto | null>(null);
  const [stage, setStage] = useState<Stage>("editing");
  const [error, setError] = useState<string | null>(null);

  function locate() {
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setGps({
          point: [position.coords.longitude, position.coords.latitude],
          accuracyM: Math.round(position.coords.accuracy),
        }),
      () => setError("Position indisponible : la parcelle servira de repère."),
      { enableHighAccuracy: true, timeout: 20_000 },
    );
  }

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setPhoto(await compressPhoto(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Photo inutilisable");
    }
  }

  async function submit() {
    if (!farm || !type) return setError("Choisissez le type de problème.");
    if (description.trim().length < 5) return setError("Décrivez le problème en quelques mots.");
    setStage("saving");
    setError(null);
    try {
      const id = crypto.randomUUID();
      const db = getAgentDatabase(userId);
      await enqueueCommand(db, {
        id,
        type: "fieldReport.create",
        payload: {
          id,
          farmId: farm.id,
          parcelId: parcel?.id,
          type,
          cropCode: cropCode ?? undefined,
          description: description.trim(),
          gps: gps ?? undefined,
          observedAt: new Date().toISOString(),
          photo: photo
            ? { contentType: photo.contentType, dataBase64: photo.dataBase64 }
            : undefined,
        },
      });
      setStage("queued");
      if (navigator.onLine) {
        const outcome = await syncOnce(userId, db, { deviceId: getDeviceId() });
        if (outcome && !outcome.error) setStage("sent");
      }
    } catch (cause) {
      setStage("editing");
      setError(cause instanceof Error ? cause.message : "Enregistrement impossible");
    }
  }

  if (stage === "queued" || stage === "sent") {
    return (
      <Alert variant={stage === "sent" ? "success" : "info"} role="status">
        <AlertTitle>
          {stage === "sent" ? "Signalement envoyé" : "Signalement enregistré"}
        </AlertTitle>
        <AlertDescription>
          <p>
            {stage === "sent"
              ? "L'agent de votre commune en est informé et viendra constater sur place."
              : "Il partira automatiquement dès que le téléphone retrouvera le réseau."}
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  if (farms.length === 0) {
    return (
      <p className="text-muted-foreground">
        Aucune exploitation enregistrée à votre nom : l&apos;agent de votre commune doit
        d&apos;abord l&apos;enregistrer.
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-base font-semibold">Quel problème ?</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(Object.keys(REPORT_TYPE_LABELS) as FieldReportType[]).map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={type === code}
              onClick={() => setType(code)}
              className={cn(
                "flex min-h-14 flex-col items-start rounded-md border px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                type === code ? "border-primary bg-accent" : "hover:bg-accent/60",
              )}
            >
              <span className="font-semibold">{REPORT_TYPE_LABELS[code].label}</span>
              <span className="text-sm text-muted-foreground">{REPORT_TYPE_LABELS[code].hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="report-farm">Exploitation</Label>
          <select
            id="report-farm"
            className="h-11 rounded-md border border-input bg-background px-3 text-base"
            value={farmId}
            onChange={(event) => {
              const next = farms.find((f) => f.id === event.target.value);
              setFarmId(event.target.value);
              setParcelId(next?.parcels[0]?.id ?? "");
              setCropCode(null);
            }}
          >
            {farms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name ?? f.code}
                {f.village ? ` (${f.village})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="report-parcel">Parcelle</Label>
          <select
            id="report-parcel"
            className="h-11 rounded-md border border-input bg-background px-3 text-base"
            value={parcelId}
            onChange={(event) => {
              setParcelId(event.target.value);
              setCropCode(null);
            }}
          >
            <option value="">Toute l&apos;exploitation</option>
            {farm?.parcels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} ({p.areaHa.toLocaleString("fr-FR")} ha)
              </option>
            ))}
          </select>
        </div>
      </div>

      {parcel && parcel.cropCodes.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Culture touchée (facultatif)</legend>
          <div className="flex flex-wrap gap-2">
            {parcel.cropCodes.map((code) => (
              <Button
                key={code}
                type="button"
                variant={cropCode === code ? "default" : "outline"}
                aria-pressed={cropCode === code}
                onClick={() => setCropCode(cropCode === code ? null : code)}
              >
                {cropNames[code] ?? code}
              </Button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="report-description">Ce que vous avez vu</Label>
        <Textarea
          id="report-description"
          rows={4}
          maxLength={1000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Par exemple : des chenilles mangent les feuilles du maïs depuis trois jours."
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" variant="outline" className="h-11" onClick={locate}>
          <LocateFixed aria-hidden />
          {gps ? `Position relevée (± ${gps.accuracyM} m)` : "Utiliser ma position"}
        </Button>
        <Label
          htmlFor="report-photo"
          className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border px-4 font-medium hover:bg-accent"
        >
          <Camera aria-hidden className="size-4" />
          {photo ? "Changer la photo" : "Ajouter une photo"}
        </Label>
        <input
          id="report-photo"
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => void choosePhoto(event.target.files?.[0])}
        />
      </div>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:), jamais servi
        <img
          src={photo.previewUrl}
          alt="Photo jointe au signalement"
          className="max-h-48 w-fit rounded-md"
        />
      ) : null}
      <p className="text-sm text-muted-foreground">
        {gps
          ? "La position de votre téléphone sera jointe au signalement."
          : "Sans position relevée, la parcelle choisie sert de repère."}
      </p>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="h-12 text-base" disabled={stage === "saving"}>
        <Send aria-hidden />
        {stage === "saving" ? "Enregistrement en cours" : "Envoyer le signalement"}
      </Button>
    </form>
  );
}
