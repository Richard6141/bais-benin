"use client";

import { useState } from "react";
import { parseAmount } from "@/components/forms/unit-amount-field";
import { ReliabilityBadge } from "@/components/data-display/reliability-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { EnrolmentData } from "./enrolment-types";
import { SEASON_LABELS } from "./season";
import { SourcedValue, StepShell } from "./step-shell";

interface StepConsentProps {
  data: EnrolmentData;
  cropNames: Readonly<Record<string, string>>;
  submitting: boolean;
  error: string | null;
  onEdit: (step: 0 | 1 | 2 | 3 | 4) => void;
  onSubmit: (consentAt: string) => void;
  onBack: () => void;
}

const TENURE_LABELS = {
  OWNED: "Propriétaire",
  RENTED: "Locataire",
  FAMILY: "Terre familiale",
} as const;
const IRRIGATION_LABELS = {
  NONE: "Aucune",
  MANUAL: "Manuelle",
  DRIP: "Goutte-à-goutte",
  FLOOD: "Inondation",
} as const;
const areaFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

// A6 : récapitulatif avec l'origine de chaque valeur, consentement lu au producteur, création.
// Le consentement est la seule case bloquante du parcours.
export function StepConsent({
  data,
  cropNames,
  submitting,
  error,
  onEdit,
  onSubmit,
  onBack,
}: StepConsentProps) {
  const [consent, setConsent] = useState(Boolean(data.consentAt));
  const { farmer, location, size, parcels, crops } = data;
  const farmerLabel =
    farmer?.mode === "EXISTING"
      ? (farmer.existingFarmerName ?? "Producteur connu")
      : `${farmer?.firstName ?? ""} ${farmer?.lastName ?? ""}`.trim();
  const cropList = (codes: string[]) => codes.map((code) => cropNames[code] ?? code).join(", ");

  return (
    <StepShell
      title="Vérifiez et enregistrez"
      description="Relisez avec le producteur. Chaque valeur indique d'où elle vient."
      primaryLabel={submitting ? "Enregistrement en cours" : "Enregistrer"}
      primaryDisabled={!consent}
      primaryBusy={submitting}
      onPrimary={() => onSubmit(data.consentAt ?? new Date().toISOString())}
      onBack={onBack}
    >
      <div className="flex flex-col gap-2">
        <SourcedValue
          label="Producteur"
          value={farmerLabel || "Non renseigné"}
          origin={farmer?.mode === "EXISTING" ? "Déjà enregistré" : "Nouveau, saisi par vous"}
          onEdit={() => onEdit(0)}
        />
        <SourcedValue
          label="Commune"
          value={location ? `${location.communeName}` : "Non renseignée"}
          origin={location?.communeSource === "GPS" ? "Depuis votre position" : "Choisie à la main"}
          onEdit={() => onEdit(1)}
        />
        <SourcedValue
          label="Superficie et faire-valoir"
          value={
            size
              ? `${areaFormatter.format(parseAmount(size.areaHa))} ha, ${TENURE_LABELS[size.tenure]}, irrigation ${IRRIGATION_LABELS[size.irrigation].toLowerCase()}`
              : "Non renseignés"
          }
          origin="Déclaré par le producteur"
          onEdit={() => onEdit(2)}
        />
        <SourcedValue
          label="Parcelles"
          value={
            parcels.length > 0
              ? parcels
                  .map(
                    (p) =>
                      `${p.name} (${areaFormatter.format(p.areaHa)} ha${p.cropCodes.length ? ` : ${cropList(p.cropCodes)}` : ""})`,
                  )
                  .join(" ; ")
              : "Aucune pour l'instant"
          }
          origin="Superficie déclarée, contour à relever à la visite"
          onEdit={() => onEdit(3)}
        />
        <SourcedValue
          label="Cultures de la campagne"
          value={
            crops
              ? `${crops.cropCodes.length ? cropList(crops.cropCodes) : "portées par les parcelles"} (${SEASON_LABELS[crops.seasonCode]})`
              : "Non renseignées"
          }
          origin="Déclaré par le producteur"
          onEdit={() => onEdit(4)}
        />
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span>Niveau de fiabilité à l&apos;enregistrement :</span>
        <ReliabilityBadge level="DECLARED" />
      </div>

      <div className="flex items-start gap-3 rounded-md border p-3">
        <Checkbox
          id="consent"
          checked={consent}
          onCheckedChange={(checked) => setConsent(checked === true)}
          className="mt-0.5"
        />
        <Label htmlFor="consent" className="leading-snug font-normal">
          Le producteur accepte l&apos;enregistrement de son exploitation dans le registre national
          et l&apos;envoi de messages sur son téléphone.
        </Label>
      </div>

      {error ? (
        <Alert variant="critical">
          <AlertTitle>Enregistrement impossible</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
          </AlertDescription>
        </Alert>
      ) : null}
    </StepShell>
  );
}
