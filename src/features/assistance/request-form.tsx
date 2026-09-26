"use client";

import { Send } from "lucide-react";
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
import type { AssistanceCategory, AssistanceFormContext } from "@/modules/assistance";
import { ASSISTANCE_CATEGORY_LABELS } from "./labels";

type Stage = "editing" | "saving" | "queued" | "sent";

const NO_FARM = "";

// « Solliciter l'État » : l'objet de la demande, l'exploitation concernée (ou la commune, quand la
// demande ne porte sur aucune exploitation), quelques mots. La demande part dans la file de
// l'appareil, comme un signalement : tout de suite s'il y a du réseau, sinon au retour du réseau.
export function RequestForm({
  userId,
  context,
}: {
  userId: string;
  context: AssistanceFormContext;
}) {
  const [category, setCategory] = useState<AssistanceCategory | null>(null);
  const [farmId, setFarmId] = useState(context.farms[0]?.id ?? NO_FARM);
  const [communeCode, setCommuneCode] = useState(context.defaultCommuneCode ?? "");
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState<Stage>("editing");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!category) return setError("Choisissez l'objet de votre demande.");
    if (description.trim().length < 5) return setError("Décrivez votre demande en quelques mots.");
    if (farmId === NO_FARM && !communeCode) return setError("Choisissez votre commune.");
    setStage("saving");
    setError(null);
    try {
      const id = crypto.randomUUID();
      const db = getAgentDatabase(userId);
      await enqueueCommand(db, {
        id,
        type: "assistance.request",
        payload: {
          id,
          category,
          description: description.trim(),
          farmId: farmId === NO_FARM ? undefined : farmId,
          communeCode: farmId === NO_FARM ? communeCode : undefined,
          requestedAt: new Date().toISOString(),
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
        <AlertTitle>{stage === "sent" ? "Demande envoyée" : "Demande enregistrée"}</AlertTitle>
        <AlertDescription>
          <p>
            {stage === "sent"
              ? "Les agents de votre commune l'ont reçue. Suivez sa prise en charge dans « Mes demandes »."
              : "Elle partira automatiquement dès que le téléphone retrouvera le réseau."}
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-base font-semibold">Objet de la demande</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(Object.keys(ASSISTANCE_CATEGORY_LABELS) as AssistanceCategory[]).map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={category === code}
              onClick={() => setCategory(code)}
              className={cn(
                "flex min-h-14 flex-col items-start rounded-md border px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                category === code ? "border-primary bg-accent" : "hover:bg-accent/60",
              )}
            >
              <span className="font-semibold">{ASSISTANCE_CATEGORY_LABELS[code].label}</span>
              <span className="text-sm text-muted-foreground">
                {ASSISTANCE_CATEGORY_LABELS[code].hint}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="assistance-farm">Exploitation concernée</Label>
          <select
            id="assistance-farm"
            className="h-11 rounded-md border border-input bg-background px-3 text-base"
            value={farmId}
            onChange={(event) => setFarmId(event.target.value)}
          >
            {context.farms.map((farm) => (
              <option key={farm.id} value={farm.id}>
                {farm.label}
              </option>
            ))}
            <option value={NO_FARM}>Aucune exploitation en particulier</option>
          </select>
        </div>
        {farmId === NO_FARM && context.defaultCommuneCode ? (
          // Commune de la fiche producteur : la demande y part toujours (le serveur l'impose).
          <p className="text-sm">
            Votre demande part aux agents de votre commune :{" "}
            <span className="font-semibold">
              {context.communes.find((c) => c.code === context.defaultCommuneCode)?.name ??
                context.defaultCommuneCode}
            </span>
            .
          </p>
        ) : farmId === NO_FARM ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="assistance-commune">Votre commune</Label>
            <select
              id="assistance-commune"
              className="h-11 rounded-md border border-input bg-background px-3 text-base"
              value={communeCode}
              onChange={(event) => setCommuneCode(event.target.value)}
            >
              <option value="">Choisir</option>
              {context.communes.map((commune) => (
                <option key={commune.code} value={commune.code}>
                  {commune.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="assistance-description">Votre demande</Label>
        <Textarea
          id="assistance-description"
          rows={4}
          maxLength={1000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Par exemple : les semences de maïs promises ne sont pas arrivées au magasin."
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="h-12 text-base" disabled={stage === "saving"}>
        <Send aria-hidden />
        {stage === "saving" ? "Enregistrement en cours" : "Envoyer ma demande"}
      </Button>
    </form>
  );
}
