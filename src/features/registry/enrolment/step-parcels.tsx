"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { CropPicker, type CropPickerOption } from "@/components/forms/crop-picker";
import { UnitAmountField, parseAmount } from "@/components/forms/unit-amount-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ParcelDraft } from "./enrolment-types";
import { StepShell } from "./step-shell";

interface StepParcelsProps {
  value: ParcelDraft[];
  farmAreaHa: number;
  cropOptions: CropPickerOption[];
  onChange: (parcels: ParcelDraft[]) => void;
  onValidate: () => void;
  onSkip: () => void;
  onBack: () => void;
}

const AREA_UNITS = [{ code: "HA" as const, label: "hectare", kgFactor: 1 }];
const areaFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

// A4 + B2c : parcelles déclarées sans relevé (superficie seule, cultures). Le tracé GPS ou sur
// carte viendra à la visite ; ici, chaque parcelle porte la position du siège comme centroïde.
export function StepParcels({
  value,
  farmAreaHa,
  cropOptions,
  onChange,
  onValidate,
  onSkip,
  onBack,
}: StepParcelsProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [cropCodes, setCropCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>();

  const total = value.reduce((sum, parcel) => sum + parcel.areaHa, 0);
  const exceeds = farmAreaHa > 0 && total > farmAreaHa * 1.05;

  function openSheet() {
    setName(`Parcelle ${value.length + 1}`);
    setArea("");
    setCropCodes([]);
    setError(undefined);
    setOpen(true);
  }

  function addParcel() {
    const areaHa = parseAmount(area);
    if (!(areaHa > 0)) {
      setError("Indiquez la superficie de la parcelle.");
      return;
    }
    onChange([
      ...value,
      {
        id: crypto.randomUUID(),
        name: name.trim() || `Parcelle ${value.length + 1}`,
        areaHa,
        cropCodes,
      },
    ]);
    setOpen(false);
  }

  return (
    <StepShell
      title="Les parcelles"
      description="Décrivez chaque parcelle avec sa superficie et ses cultures. Le contour sera relevé à la visite."
      primaryLabel={value.length > 0 ? "Continuer" : "Ajouter une parcelle"}
      onPrimary={value.length > 0 ? onValidate : openSheet}
      onBack={onBack}
      secondary={{ label: "Sans parcelle pour l'instant", onClick: onSkip }}
    >
      {value.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Parcelles">
          {value.map((parcel) => (
            <li
              key={parcel.id}
              className="flex min-h-14 items-center justify-between gap-3 rounded-lg border bg-card px-4 py-2"
            >
              <div className="flex flex-col">
                <span className="font-medium">{parcel.name}</span>
                <span className="tabular text-sm text-muted-foreground">
                  {areaFormatter.format(parcel.areaHa)} ha ·{" "}
                  {parcel.cropCodes.length > 0
                    ? parcel.cropCodes
                        .map((code) => cropOptions.find((c) => c.code === code)?.nameFr ?? code)
                        .join(", ")
                    : "cultures à préciser"}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Retirer ${parcel.name}`}
                onClick={() => onChange(value.filter((p) => p.id !== parcel.id))}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Aucune parcelle décrite pour l&apos;instant.
        </p>
      )}

      {value.length > 0 ? (
        <Button type="button" variant="outline" className="h-12" onClick={openSheet}>
          <Plus aria-hidden />
          Ajouter une parcelle
        </Button>
      ) : null}

      <p className="tabular text-sm text-muted-foreground">
        Total des parcelles : {areaFormatter.format(total)} ha sur{" "}
        {areaFormatter.format(farmAreaHa)} ha déclarés.
      </p>
      {exceeds ? (
        <Alert variant="watch">
          <AlertTitle>Les parcelles dépassent la superficie déclarée</AlertTitle>
          <AlertDescription>
            <p>
              Vous pouvez corriger la superficie à l&apos;étape précédente ou garder ces valeurs ;
              l&apos;écart sera signalé.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-xl">
          <SheetHeader className="px-0">
            <SheetTitle>Ajouter une parcelle</SheetTitle>
            <SheetDescription>
              Superficie seule pour l&apos;instant ; le contour sera relevé sur place.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="parcel-name">Nom</Label>
              <Input id="parcel-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <UnitAmountField
              id="parcel-area"
              label="Superficie"
              value={{ amount: area, unit: "HA" }}
              onChange={(next) => setArea(next.amount)}
              units={AREA_UNITS}
              showEquivalent={false}
              error={error}
            />
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Cultures de la campagne</span>
              <CropPicker
                id="parcel-crops"
                crops={cropOptions}
                value={cropCodes}
                onChange={setCropCodes}
              />
            </div>
            <Button type="button" className="h-14 text-base" onClick={addParcel}>
              Ajouter la parcelle
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </StepShell>
  );
}
