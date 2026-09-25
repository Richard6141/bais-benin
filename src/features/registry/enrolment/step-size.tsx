"use client";

import { useState } from "react";
import { UnitAmountField, parseAmount } from "@/components/forms/unit-amount-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Irrigation, SizeSection, Tenure } from "./enrolment-types";
import { StepShell } from "./step-shell";

interface StepSizeProps {
  value: SizeSection | null;
  /** Somme des parcelles déjà décrites, proposée comme superficie (origine « depuis les parcelles »). */
  parcelsTotalHa?: number;
  onValidate: (value: SizeSection) => void;
  onBack: () => void;
  onLater: () => void;
}

const TENURES: { code: Tenure; label: string }[] = [
  { code: "OWNED", label: "Propriétaire" },
  { code: "RENTED", label: "Locataire" },
  { code: "FAMILY", label: "Terre familiale" },
];

const IRRIGATIONS: { code: Irrigation; label: string }[] = [
  { code: "NONE", label: "Aucune" },
  { code: "MANUAL", label: "Manuelle" },
  { code: "DRIP", label: "Goutte-à-goutte" },
  { code: "FLOOD", label: "Inondation" },
];

const AREA_UNITS = [{ code: "HA" as const, label: "hectare", kgFactor: 1 }];

// A3 : trois champs, tous en boutons ou clavier numérique. Une superficie très élevée est
// signalée mais jamais bloquée : les grandes exploitations existent dans le nord.
export function StepSize({ value, parcelsTotalHa, onValidate, onBack, onLater }: StepSizeProps) {
  const [area, setArea] = useState(
    value?.areaHa ?? (parcelsTotalHa ? String(parcelsTotalHa).replace(".", ",") : ""),
  );
  const [tenure, setTenure] = useState<Tenure | null>(value?.tenure ?? null);
  const [irrigation, setIrrigation] = useState<Irrigation>(value?.irrigation ?? "NONE");
  const [error, setError] = useState<string | undefined>();

  const areaValue = parseAmount(area);
  const large = areaValue > 50;

  function submit() {
    if (!(areaValue > 0)) {
      setError("Indiquez la superficie en hectares, par exemple 1,5.");
      return;
    }
    if (!tenure) {
      setError("Choisissez le mode de faire-valoir.");
      return;
    }
    setError(undefined);
    onValidate({ areaHa: area, tenure, irrigation });
  }

  return (
    <StepShell
      title="Quelle taille ?"
      description="Superficie totale déclarée par le producteur ; le tracé des parcelles pourra la préciser."
      primaryLabel="Continuer"
      onPrimary={submit}
      onBack={onBack}
      secondary={{ label: "Finir plus tard", onClick: onLater }}
    >
      <UnitAmountField
        id="farm-area"
        label="Superficie totale"
        value={{ amount: area, unit: "HA" }}
        onChange={(next) => setArea(next.amount)}
        units={AREA_UNITS}
        referenceUnit="ha"
        showEquivalent={false}
        error={error && !(areaValue > 0) ? error : undefined}
      />
      {parcelsTotalHa && !value ? (
        <p className="text-xs text-muted-foreground">Proposée depuis les parcelles décrites.</p>
      ) : null}
      {large ? (
        <Alert variant="watch">
          <AlertTitle>Superficie très élevée</AlertTitle>
          <AlertDescription>
            <p>
              {area} ha est rare pour une exploitation familiale : confirmez avec le producteur.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <ChoiceGroup
        label="Mode de faire-valoir"
        options={TENURES}
        value={tenure}
        onChange={setTenure}
        columns={3}
      />
      {error && areaValue > 0 && !tenure ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}
      <ChoiceGroup
        label="Irrigation"
        options={IRRIGATIONS}
        value={irrigation}
        onChange={setIrrigation}
        columns={2}
      />
    </StepShell>
  );
}

function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  columns,
}: {
  label: string;
  options: readonly { code: T; label: string }[];
  value: T | null;
  onChange: (code: T) => void;
  columns: 2 | 3;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div
        role="group"
        aria-label={label}
        className={columns === 3 ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}
      >
        {options.map((option) => (
          <Button
            key={option.code}
            type="button"
            variant={value === option.code ? "default" : "outline"}
            aria-pressed={value === option.code}
            className="h-12 whitespace-normal"
            onClick={() => onChange(option.code)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
