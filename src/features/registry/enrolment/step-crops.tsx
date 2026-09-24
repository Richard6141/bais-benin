"use client";

import { useState } from "react";
import { CropPicker, type CropPickerOption } from "@/components/forms/crop-picker";
import { Button } from "@/components/ui/button";
import type { CropsSection, SeasonCode } from "./enrolment-types";
import { SEASON_LABELS } from "./season";
import { StepShell } from "./step-shell";

interface StepCropsProps {
  value: CropsSection | null;
  cropOptions: CropPickerOption[];
  /** Sous-saison déduite du mois et du régime de la commune ; modifiable. */
  suggestedSeason: Exclude<SeasonCode, "ANNUAL">;
  hasParcels: boolean;
  onValidate: (value: CropsSection) => void;
  onBack: () => void;
  onLater: () => void;
}

const SEASONS: Exclude<SeasonCode, "ANNUAL">[] = ["MAIN_RAINY", "SHORT_RAINY", "DRY"];

// A5 : cultures de la campagne. Quand des parcelles portent déjà leurs cultures, l'écran ne
// demande que la sous-saison ; sinon il recueille les cultures de toute l'exploitation.
export function StepCrops({
  value,
  cropOptions,
  suggestedSeason,
  hasParcels,
  onValidate,
  onBack,
  onLater,
}: StepCropsProps) {
  const [cropCodes, setCropCodes] = useState<string[]>(value?.cropCodes ?? []);
  const [seasonCode, setSeasonCode] = useState<SeasonCode>(value?.seasonCode ?? suggestedSeason);

  return (
    <StepShell
      title={hasParcels ? "Quelle sous-saison ?" : "Quelles cultures ?"}
      description={
        hasParcels
          ? "Les cultures sont déjà portées par les parcelles ; confirmez la sous-saison en cours."
          : "Cultures de la campagne pour toute l'exploitation, trois au plus."
      }
      primaryLabel="Continuer"
      primaryDisabled={!hasParcels && cropCodes.length === 0}
      onPrimary={() => onValidate({ cropCodes: hasParcels ? [] : cropCodes, seasonCode })}
      onBack={onBack}
      secondary={{ label: "Finir plus tard", onClick: onLater }}
    >
      {!hasParcels ? (
        <CropPicker id="farm-crops" crops={cropOptions} value={cropCodes} onChange={setCropCodes} />
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Sous-saison</span>
        <div role="group" aria-label="Sous-saison" className="grid gap-2">
          {SEASONS.map((season) => (
            <Button
              key={season}
              type="button"
              variant={seasonCode === season ? "default" : "outline"}
              aria-pressed={seasonCode === season}
              className="h-12 justify-start whitespace-normal"
              onClick={() => setSeasonCode(season)}
            >
              {SEASON_LABELS[season]}
              {season === suggestedSeason ? (
                <span className="ml-auto text-xs opacity-80">selon la date</span>
              ) : null}
            </Button>
          ))}
        </div>
      </div>
    </StepShell>
  );
}
