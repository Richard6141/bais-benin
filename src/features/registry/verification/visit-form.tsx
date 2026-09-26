"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { HelpTip } from "@/components/forms/help-tip";
import { LocationPicker, type GeoPosition } from "@/components/forms/location-picker";
import { StepIndicator } from "@/components/forms/step-indicator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAgentDatabase } from "@/lib/offline/db";
import { useSync } from "@/lib/offline/use-sync";
import { cn } from "@/lib/utils";
import { buildVerificationCommand, type VisitOutcome } from "./visit-command";

/** Parcelle à regarder pendant la visite : culture déclarée, et l'avis du satellite s'il diffère. */
export interface VisitParcel {
  id: string;
  code: string;
  areaHa: number;
  declaredCropCode: string | null;
  declaredCropName: string | null;
  /** Culture vue par le satellite, seulement quand elle diffère ou reste incertaine. */
  measured: { label: string; confidence: number } | null;
}

interface VisitFormProps {
  userId: string;
  farm: {
    id: string;
    code: string;
    farmerName: string;
    declaredAreaHa: number;
    communeName: string;
  };
  parcels?: VisitParcel[];
  crops?: { code: string; name: string }[];
}

/** Valeur du choix « parcelle non vue » : aucune culture n'est alors envoyée. */
const NOT_SEEN = "";

const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });

const OUTCOMES: Array<{ value: VisitOutcome; label: string; hint: string }> = [
  { value: "CONFIRMED", label: "Confirmée", hint: "Ce qui est déclaré correspond au terrain." },
  { value: "CORRECTED", label: "Corrigée", hint: "Vous ajustez la superficie constatée." },
  { value: "REJECTED", label: "Rejetée", hint: "Exploitation introuvable ou déclaration erronée." },
];

// Visite de vérification (parcours D3-D4) : trois sous-écrans, une main, tout est écrit dans
// l'outbox et part à la prochaine synchronisation.
export function VisitForm({ userId, farm, parcels = [], crops = [] }: VisitFormProps) {
  const router = useRouter();
  const sync = useSync(userId);
  // L'étape des cultures n'existe que si l'exploitation a des parcelles.
  const steps =
    parcels.length > 0
      ? ["Identité", "Position", "Cultures", "Résultat"]
      : ["Identité", "Position", "Résultat"];
  const cropsStep = parcels.length > 0 ? 2 : -1;
  const lastStep = steps.length - 1;
  const [step, setStep] = useState(0);
  const [observed, setObserved] = useState<Record<string, string>>(() =>
    Object.fromEntries(parcels.map((parcel) => [parcel.id, parcel.declaredCropCode ?? NOT_SEEN])),
  );
  const [identityConfirmed, setIdentityConfirmed] = useState<boolean | null>(null);
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [outcome, setOutcome] = useState<VisitOutcome | null>(null);
  const [correctedArea, setCorrectedArea] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit() {
    setError(null);
    const built = buildVerificationCommand({
      farmId: farm.id,
      identityConfirmed: identityConfirmed === true,
      outcome: outcome ?? "CONFIRMED",
      position,
      correctedArea,
      notes,
      observedCrops: Object.entries(observed)
        .filter(([, cropCode]) => cropCode !== NOT_SEEN)
        .map(([parcelId, cropCode]) => ({ parcelId, cropCode })),
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
          <CardTitle>Visite enregistrée</CardTitle>
          <CardDescription>
            {sync.online
              ? "Elle est envoyée au serveur maintenant."
              : "Elle partira dès que le réseau reviendra. Vous pouvez continuer votre tournée."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Button asChild className="h-12">
            <Link href="/agent/verification">Visite suivante</Link>
          </Button>
          <Button asChild variant="outline" className="h-12">
            <Link href={`/agent/exploitations/${farm.id}`}>Voir la fiche</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-24 md:pb-0">
      <StepIndicator steps={steps} current={step} />

      {step === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Le producteur est-il bien {farm.farmerName} ?</CardTitle>
            <CardDescription>
              Vérifiez avec une pièce d&apos;identité ou un témoin du village.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <ChoiceButton
              selected={identityConfirmed === true}
              onClick={() => setIdentityConfirmed(true)}
            >
              Oui, identité confirmée
            </ChoiceButton>
            <ChoiceButton
              selected={identityConfirmed === false}
              onClick={() => setIdentityConfirmed(false)}
            >
              Non, ou personne absente
            </ChoiceButton>
          </CardContent>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Où êtes-vous ?</CardTitle>
            <CardDescription>
              La position de la visite est enregistrée avec la date. Le siège pourra être corrigé.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LocationPicker value={position} onChange={setPosition} label={farm.communeName} />
          </CardContent>
        </Card>
      ) : null}

      {step === cropsStep ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-1">
              <CardTitle>Culture vue sur chaque parcelle</CardTitle>
              <HelpTip label="Culture vue">
                La culture que vous voyez sur place, même si elle diffère de la déclaration. Elle
                sert à apprendre au satellite à reconnaître les cultures. Si vous ne voyez pas la
                parcelle, choisissez « Non vue ».
              </HelpTip>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {parcels.map((parcel) => (
              <div key={parcel.id} className="flex flex-col gap-1 rounded-md border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-mono text-sm font-semibold">{parcel.code}</span>
                  <span className="tabular text-sm text-muted-foreground">
                    {parcel.areaHa.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ha
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Déclarée : {parcel.declaredCropName ?? "aucune culture"}
                </p>
                {parcel.measured ? (
                  <p className="text-sm font-medium text-warning">
                    Satellite : {parcel.measured.label.toLowerCase()},{" "}
                    {percent.format(parcel.measured.confidence)}
                  </p>
                ) : null}
                <Label htmlFor={`culture-${parcel.id}`} className="mt-1">
                  Culture vue
                </Label>
                <select
                  id={`culture-${parcel.id}`}
                  value={observed[parcel.id] ?? NOT_SEEN}
                  onChange={(event) =>
                    setObserved((current) => ({ ...current, [parcel.id]: event.target.value }))
                  }
                  className="h-12 rounded-md border bg-background px-3 text-base"
                >
                  <option value={NOT_SEEN}>Non vue</option>
                  {crops.map((crop) => (
                    <option key={crop.code} value={crop.code}>
                      {crop.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {step === lastStep ? (
        <Card>
          <CardHeader>
            <CardTitle>Résultat de la visite</CardTitle>
            <CardDescription>Superficie déclarée : {farm.declaredAreaHa} ha.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-2" role="group" aria-label="Issue de la visite">
              {OUTCOMES.map((option) => (
                <ChoiceButton
                  key={option.value}
                  selected={outcome === option.value}
                  onClick={() => setOutcome(option.value)}
                  className="justify-start text-left"
                >
                  <span className="flex flex-col">
                    <span>{option.label}</span>
                    <span className="text-xs font-normal text-muted-foreground">{option.hint}</span>
                  </span>
                </ChoiceButton>
              ))}
            </div>
            {outcome === "CORRECTED" ? (
              <div>
                <Label htmlFor="corrected-area">Superficie constatée (ha)</Label>
                <Input
                  id="corrected-area"
                  inputMode="decimal"
                  value={correctedArea}
                  onChange={(event) => setCorrectedArea(event.target.value)}
                  placeholder="ex. 2,5"
                  className="mt-1 h-12"
                />
              </div>
            ) : null}
            <div>
              <Label htmlFor="notes">
                Note {outcome === "REJECTED" ? "(obligatoire pour un rejet)" : "(facultative)"}
              </Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={1000}
                className="mt-1"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Alert variant="critical" role="alert">
          <AlertTitle>Impossible d&apos;enregistrer</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t bg-background/95 p-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto flex max-w-6xl gap-2">
          {step > 0 ? (
            <Button variant="outline" className="h-12" onClick={() => setStep(step - 1)}>
              Retour
            </Button>
          ) : (
            <Button variant="outline" className="h-12" onClick={() => router.back()}>
              Annuler
            </Button>
          )}
          {step < lastStep ? (
            <Button
              className="h-12 flex-1"
              disabled={step === 0 && identityConfirmed === null}
              onClick={() => setStep(step + 1)}
            >
              Continuer
            </Button>
          ) : (
            <Button
              className="h-12 flex-1"
              disabled={outcome === null}
              onClick={() => void submit()}
            >
              Valider la visite
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ChoiceButton({
  selected,
  onClick,
  className,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex min-h-14 items-center justify-center rounded-lg border-2 px-4 py-3 text-sm font-semibold transition-colors",
        selected ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent",
        className,
      )}
    >
      {children}
    </button>
  );
}
