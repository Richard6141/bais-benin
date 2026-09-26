"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { CropCode } from "@/components/data-display/crop-glyph";
import { CropGlyph } from "@/components/data-display/crop-glyph";
import { CropPicker } from "@/components/forms/crop-picker";
import { StepIndicator } from "@/components/forms/step-indicator";
import {
  HARVEST_UNITS,
  UnitAmountField,
  describeKgEquivalent,
  type HarvestUnit,
  type UnitAmountValue,
} from "@/components/forms/unit-amount-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { declareHarvestAction, type HarvestActionState } from "./actions";
import { formatHarvestOf } from "./format";
import {
  LOSS_CAUSES,
  LOSS_LEVELS,
  WIZARD_STEP_LABELS,
  initialSeason,
  initialStep,
  nextStep,
  parseQuantity,
  previousStep,
  visibleSteps,
  type LossCause,
  type LossLevel,
  type WizardSeason,
  type WizardStep,
} from "./wizard-logic";

interface HarvestWizardProps {
  seasons: readonly WizardSeason[];
  parcelCount: number;
}

const initialState: HarvestActionState = { status: "idle" };
const bigButton = "h-14 w-full text-base";

// Parcours en trois questions (docs/modules/registre-parcours-ux.md §2.C) : une colonne, un
// bouton par écran, pictogrammes 48 px, aucun onglet. L'écran de choix est sauté quand une seule
// culture est déclarée ; les pertes sont facultatives.
export function HarvestWizard({ seasons, parcelCount }: HarvestWizardProps) {
  const [step, setStep] = useState<WizardStep>(() => initialStep(seasons));
  const [season, setSeason] = useState<WizardSeason | null>(() => initialSeason(seasons));
  const [quantity, setQuantity] = useState<UnitAmountValue>({
    amount: "",
    unit: (initialSeason(seasons)?.tradeUnit as HarvestUnit | undefined) ?? "BAG_100KG",
  });
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [lossLevel, setLossLevel] = useState<LossLevel | null>(null);
  const [lossCause, setLossCause] = useState<LossCause | null>(null);
  const [state, action, pending] = useActionState(declareHarvestAction, initialState);

  const steps = visibleSteps(seasons);
  const cropOptions = [...new Map(seasons.map((s) => [s.cropCode, s])).values()].map((s) => ({
    code: s.cropCode as CropCode,
    nameFr: s.cropName,
  }));
  const seasonsOfCrop = season ? seasons.filter((s) => s.cropCode === season.cropCode) : [];
  const quantityValue = parseQuantity(quantity.amount);

  if (state.status === "success" || step === "DONE") {
    return (
      <Card>
        <CardContent className="flex flex-col gap-6 pt-6">
          <p className="text-2xl font-semibold text-balance">
            Merci, votre récolte est enregistrée.
          </p>
          {state.summary ? <p className="text-lg">{state.summary}</p> : null}
          {state.warnings?.map((warning) => (
            <Alert key={warning} variant="info">
              <AlertTitle>À noter</AlertTitle>
              <AlertDescription>
                <p>{warning}</p>
              </AlertDescription>
            </Alert>
          ))}
          <Button asChild className={bigButton}>
            <Link href="/agriculteur">Retour à mon exploitation</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (seasons.length === 0) {
    return (
      <Alert variant="watch">
        <AlertTitle>Aucune culture déclarée cette campagne</AlertTitle>
        <AlertDescription>
          <p>
            Demandez à votre agent d&apos;ajouter vos cultures, puis revenez déclarer votre récolte.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  function goToQuantity() {
    if (!season) return;
    setQuantity((q) => ({ ...q, unit: (season.tradeUnit as HarvestUnit) ?? q.unit }));
    setStep("QUANTITY");
  }

  function validateQuantity() {
    const value = parseQuantity(quantity.amount);
    if (Number.isNaN(value) || value <= 0) {
      setQuantityError("Indiquez une quantité.");
      return;
    }
    setQuantityError(null);
    setStep(nextStep("QUANTITY"));
  }

  return (
    <div className="flex flex-col gap-6">
      <StepIndicator
        steps={steps.map((s) => WIZARD_STEP_LABELS[s])}
        current={Math.max(0, steps.indexOf(step as (typeof steps)[number]))}
      />

      {step === "CROP" ? (
        <section className="flex flex-col gap-5" aria-labelledby="etape-culture">
          <h2 id="etape-culture" className="text-2xl font-semibold">
            Quelle culture avez-vous récoltée ?
          </h2>
          <CropPicker
            id="culture"
            crops={cropOptions}
            value={season ? [season.cropCode] : []}
            max={1}
            onChange={(codes) => setSeason(seasons.find((s) => s.cropCode === codes[0]) ?? null)}
          />
          {seasonsOfCrop.length > 1 ? (
            <div className="flex flex-col gap-2">
              <p className="text-base font-medium">Sur quelle parcelle ?</p>
              {seasonsOfCrop.map((s) => (
                <button
                  key={s.parcelCropId}
                  type="button"
                  onClick={() => setSeason(s)}
                  aria-pressed={season?.parcelCropId === s.parcelCropId}
                  className={cn(
                    "h-14 rounded-md border px-4 text-left text-base",
                    season?.parcelCropId === s.parcelCropId
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border",
                  )}
                >
                  Parcelle {s.parcelCode.split("-").pop()}
                </button>
              ))}
            </div>
          ) : null}
          <Button className={bigButton} disabled={!season} onClick={goToQuantity}>
            C&apos;est celle-ci
          </Button>
        </section>
      ) : null}

      {step === "QUANTITY" && season ? (
        <section className="flex flex-col gap-5" aria-labelledby="etape-quantite">
          <div className="flex items-center gap-3">
            <CropGlyph code={season.cropCode as CropCode} size={48} className="text-primary" />
            <h2 id="etape-quantite" className="text-2xl font-semibold">
              Combien de {season.cropName.toLowerCase()} ?
            </h2>
          </div>
          <UnitAmountField
            id="quantite"
            label="Quantité récoltée"
            value={quantity}
            onChange={setQuantity}
            error={quantityError ?? undefined}
            className="text-lg [&_button]:h-14 [&_input]:h-14 [&_input]:text-2xl"
          />
          <Button className={bigButton} onClick={validateQuantity}>
            Continuer
          </Button>
          {seasons.length > 1 ? (
            <Button
              variant="ghost"
              className="h-12 w-full text-base"
              onClick={() => setStep(previousStep("QUANTITY", seasons))}
            >
              Changer de culture
            </Button>
          ) : null}
        </section>
      ) : null}

      {step === "LOSSES" && season ? (
        <form action={action} className="flex flex-col gap-5" aria-labelledby="etape-pertes">
          <input type="hidden" name="parcelCropId" value={season.parcelCropId} />
          <input type="hidden" name="cropName" value={season.cropName} />
          <input type="hidden" name="parcelCode" value={season.parcelCode} />
          <input type="hidden" name="parcelCount" value={parcelCount} />
          <input type="hidden" name="campaignCode" value={season.campaignCode} />
          <input type="hidden" name="amount" value={quantity.amount} />
          <input type="hidden" name="unit" value={quantity.unit} />
          <input type="hidden" name="lossLevel" value={lossLevel ?? ""} />
          <input
            type="hidden"
            name="lossCause"
            value={lossLevel && lossLevel !== "NONE" ? (lossCause ?? "") : ""}
          />

          <h2 id="etape-pertes" className="text-2xl font-semibold">
            Avez-vous eu des pertes ?
          </h2>
          <p className="text-base text-muted-foreground">
            {Number.isNaN(quantityValue)
              ? season.cropName
              : formatHarvestOf(quantityValue, quantity.unit, season.cropName)}
            {describeKgEquivalent(quantity, HARVEST_UNITS)
              ? ` (${describeKgEquivalent(quantity, HARVEST_UNITS)})`
              : ""}
            . Cette question est facultative.
          </p>
          <div className="grid gap-2" role="group" aria-label="Niveau de pertes">
            {LOSS_LEVELS.map((level) => (
              <button
                key={level.code}
                type="button"
                onClick={() => setLossLevel(level.code)}
                aria-pressed={lossLevel === level.code}
                className={cn(
                  "h-14 rounded-md border px-4 text-left text-base font-medium",
                  lossLevel === level.code
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-border",
                )}
              >
                {level.label}
              </button>
            ))}
          </div>
          {lossLevel && lossLevel !== "NONE" ? (
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Cause des pertes">
              {LOSS_CAUSES.map((cause) => (
                <button
                  key={cause.code}
                  type="button"
                  onClick={() => setLossCause(cause.code)}
                  aria-pressed={lossCause === cause.code}
                  className={cn(
                    "h-14 rounded-md border px-3 text-base",
                    lossCause === cause.code
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border",
                  )}
                >
                  {cause.label}
                </button>
              ))}
            </div>
          ) : null}
          {state.status === "error" ? (
            <Alert variant="critical">
              <AlertTitle>Enregistrement impossible</AlertTitle>
              <AlertDescription>
                <p>
                  {state.message ??
                    Object.values(state.fieldErrors ?? {})[0] ??
                    "Vérifiez votre saisie."}
                </p>
              </AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" className={bigButton} disabled={pending}>
            {pending ? "Enregistrement en cours" : "Enregistrer ma récolte"}
          </Button>
          <Button
            type="submit"
            variant="outline"
            className="h-12 w-full text-base"
            disabled={pending}
            onClick={() => {
              setLossLevel(null);
              setLossCause(null);
            }}
          >
            Passer
          </Button>
        </form>
      ) : null}
    </div>
  );
}
