"use client";

import { useState } from "react";
import { LocationPicker, type GeoPosition } from "@/components/forms/location-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReferentielBundle } from "@/modules/registry/referentiel";
import type { LocationSection } from "./enrolment-types";
import { locateCommune } from "./locate-commune";
import { SourcedValue, StepShell } from "./step-shell";

interface StepLocationProps {
  communes: ReferentielBundle["communes"];
  allowedCommuneCodes: readonly string[] | "all";
  value: LocationSection | null;
  onValidate: (value: LocationSection) => void;
  onBack: () => void;
  onLater: () => void;
}

// A2 : la position GPS donne la commune sans réseau (contours embarqués). L'agent voit l'origine
// de la valeur et peut la corriger ; une commune hors périmètre est signalée, pas interdite.
export function StepLocation({
  communes,
  allowedCommuneCodes,
  value,
  onValidate,
  onBack,
  onLater,
}: StepLocationProps) {
  const [position, setPosition] = useState<GeoPosition | null>(value?.position ?? null);
  const [communeCode, setCommuneCode] = useState<string | null>(value?.communeCode ?? null);
  const [source, setSource] = useState<"GPS" | "MANUAL">(value?.communeSource ?? "GPS");
  const [editing, setEditing] = useState(false);
  const [notLocated, setNotLocated] = useState(false);

  const allowed =
    allowedCommuneCodes === "all"
      ? communes
      : communes.filter((c) => allowedCommuneCodes.includes(c.code));
  const commune = communes.find((c) => c.code === communeCode) ?? null;
  const outsidePerimeter =
    communeCode !== null &&
    allowedCommuneCodes !== "all" &&
    !allowedCommuneCodes.includes(communeCode);

  function handlePosition(next: GeoPosition) {
    setPosition(next);
    const located = locateCommune(communes, [next.lng, next.lat]);
    if (located) {
      setCommuneCode(located.commune.code);
      setSource("GPS");
      setNotLocated(false);
      setEditing(false);
    } else {
      setNotLocated(true);
      setEditing(true);
    }
  }

  return (
    <StepShell
      title="Où se trouve l'exploitation ?"
      description="La commune est déduite de la position du téléphone, sur l'appareil."
      primaryLabel="Continuer"
      primaryDisabled={!position || !commune}
      onPrimary={() => {
        if (!position || !commune) return;
        onValidate({
          position,
          communeCode: commune.code,
          communeName: commune.name,
          communeSource: source,
          outsidePerimeter,
        });
      }}
      onBack={onBack}
      secondary={{ label: "Finir plus tard", onClick: onLater }}
    >
      <LocationPicker
        value={position}
        onChange={handlePosition}
        label={commune ? `${commune.name}, ${commune.departementName}` : null}
      />

      {commune && !editing ? (
        <SourcedValue
          label="Commune"
          value={`${commune.name} (${commune.departementName})`}
          origin={source === "GPS" ? "Depuis votre position" : "Choisie à la main"}
          onEdit={() => setEditing(true)}
        />
      ) : null}

      {editing || (!commune && position) ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="location-commune">Commune</Label>
          <Select
            value={communeCode ?? undefined}
            onValueChange={(code) => {
              setCommuneCode(code);
              setSource("MANUAL");
              setEditing(false);
              setNotLocated(false);
            }}
          >
            <SelectTrigger id="location-commune" className="h-11 w-full">
              <SelectValue placeholder="Choisir une commune" />
            </SelectTrigger>
            <SelectContent>
              {allowed.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.name} ({c.departementName})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {notLocated ? (
        <Alert variant="watch">
          <AlertTitle>Commune non reconnue</AlertTitle>
          <AlertDescription>
            <p>
              La position est hors des communes téléchargées : choisissez la commune dans la liste.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {outsidePerimeter ? (
        <Alert variant="watch">
          <AlertTitle>Hors de vos communes affectées</AlertTitle>
          <AlertDescription>
            <p>
              Vous pouvez continuer ; l&apos;enregistrement sera vérifié par votre superviseur à la
              synchronisation.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
    </StepShell>
  );
}
