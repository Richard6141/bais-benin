"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { CropPickerOption } from "@/components/forms/crop-picker";
import { StepIndicator } from "@/components/forms/step-indicator";
import { parseAmount } from "@/components/forms/unit-amount-field";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAgentDatabase } from "@/lib/offline/db";
import { loadReferentiel } from "@/lib/offline/referentiel-cache";
import { useSync } from "@/lib/offline/use-sync";
import type { CropCode } from "@/components/data-display/crop-glyph";
import {
  createEnrolmentDraft,
  loadEnrolmentDraft,
  saveEnrolmentSection,
  type EnrolmentDraft,
} from "./enrolment-draft";
import { submitEnrolment } from "./enrolment-submit";
import {
  ENROLMENT_STEPS,
  firstIncompleteStep,
  type EnrolmentData,
  type EnrolmentStep,
} from "./enrolment-types";
import { currentCampaignCode, seasonForMonth } from "./season";
import { StepConsent } from "./step-consent";
import { StepCrops } from "./step-crops";
import { StepDone } from "./step-done";
import { StepFarmer } from "./step-farmer";
import { StepLocation } from "./step-location";
import { StepParcels } from "./step-parcels";
import { StepSize } from "./step-size";

interface EnrolmentWizardProps {
  userId: string;
  allowedCommuneCodes: readonly string[] | "all";
}

// Orchestration des sept écrans : le brouillon Dexie est la source de vérité, l'écran courant
// n'est qu'un curseur. Reprise par ?brouillon=<id>, sinon un nouveau brouillon est créé.
export function EnrolmentWizard({ userId, allowedCommuneCodes }: EnrolmentWizardProps) {
  const db = useMemo(() => getAgentDatabase(userId), [userId]);
  const router = useRouter();
  const params = useSearchParams();
  const requestedId = params.get("brouillon");
  const sync = useSync(userId);

  const [draft, setDraft] = useState<EnrolmentDraft | null>(null);
  const [step, setStep] = useState<EnrolmentStep>(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const bundle = useLiveQuery(() => loadReferentiel(db), [db]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = requestedId ? await loadEnrolmentDraft(db, requestedId) : null;
      const current = existing ?? (await createEnrolmentDraft(db));
      if (cancelled) return;
      setDraft(current);
      setStep(firstIncompleteStep(current.data));
      // Adresse mise à jour sans aller-retour serveur : l'écran doit fonctionner hors ligne.
      if (!existing)
        window.history.replaceState(null, "", `/agent/enregistrer?brouillon=${current.id}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, requestedId]);

  const commune =
    bundle?.communes.find((c) => c.code === draft?.data.location?.communeCode) ?? null;
  const cropOptions = useMemo<CropPickerOption[]>(() => {
    const zone = commune?.zoneCode ?? null;
    return (bundle?.crops ?? []).map((crop) => ({
      code: crop.code as CropCode,
      nameFr: crop.nameFr,
      suggested: zone !== null && crop.mainZoneCodes.includes(zone),
    }));
  }, [bundle, commune]);
  const cropNames = useMemo(
    () => Object.fromEntries((bundle?.crops ?? []).map((c) => [c.code, c.nameFr])),
    [bundle],
  );
  const cropCycles = useMemo(
    () => Object.fromEntries((bundle?.crops ?? []).map((c) => [c.code, c.cycle])),
    [bundle],
  );

  async function save(patch: Partial<EnrolmentData>, next: EnrolmentStep) {
    if (!draft) return;
    const updated = await saveEnrolmentSection(db, draft.id, patch, next);
    if (updated) setDraft(updated);
    setStep(next);
  }

  async function handleSubmit(consentAt: string) {
    if (!draft || !bundle) return;
    const campaignCode = currentCampaignCode(bundle.campaigns);
    if (!campaignCode) {
      setSubmitError("Aucune campagne agricole dans le référentiel : mettez-le à jour.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await saveEnrolmentSection(db, draft.id, { consentAt }, 5);
      await submitEnrolment(db, draft.id, { campaignCode, cropCycles });
      const refreshed = await loadEnrolmentDraft(db, draft.id);
      if (refreshed) setDraft(refreshed);
      setStep(6);
      if (navigator.onLine) void sync.sync();
    } catch (cause) {
      setSubmitError(
        cause instanceof Error ? cause.message : "Enregistrement impossible sur cet appareil.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (bundle === undefined || !draft) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <span className="sr-only">Chargement du brouillon</span>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (bundle === null) {
    return (
      <EmptyState
        title="Référentiel non téléchargé"
        description="Téléchargez une fois les communes, cultures et campagnes de votre périmètre pour enregistrer sans réseau."
        action={
          <Button asChild className="h-12">
            <Link href="/agent/premier-lancement">Préparer le hors-ligne</Link>
          </Button>
        }
      />
    );
  }

  const data = draft.data;
  const goLater = () => router.push("/agent/en-cours");
  const farmerLabel =
    data.farmer?.mode === "EXISTING"
      ? (data.farmer.existingFarmerName ?? "Producteur")
      : `${data.farmer?.firstName ?? ""} ${data.farmer?.lastName ?? ""}`.trim();
  const suggestedSeason = seasonForMonth(
    new Date().getMonth() + 1,
    commune?.rainfallRegime ?? null,
  );
  const farmAreaHa = data.size ? parseAmount(data.size.areaHa) : 0;

  return (
    <div className="flex flex-col gap-6">
      {step < 6 ? <StepIndicator steps={ENROLMENT_STEPS.slice(0, 6)} current={step} /> : null}
      {step === 0 ? (
        <StepFarmer
          db={db}
          value={data.farmer}
          onValidate={(farmer) => void save({ farmer }, 1)}
          onLater={goLater}
        />
      ) : null}
      {step === 1 ? (
        <StepLocation
          communes={bundle.communes}
          allowedCommuneCodes={allowedCommuneCodes}
          value={data.location}
          onValidate={(location) => void save({ location }, 2)}
          onBack={() => setStep(0)}
          onLater={goLater}
        />
      ) : null}
      {step === 2 ? (
        <StepSize
          value={data.size}
          parcelsTotalHa={data.parcels.reduce((sum, p) => sum + p.areaHa, 0) || undefined}
          onValidate={(size) => void save({ size }, 3)}
          onBack={() => setStep(1)}
          onLater={goLater}
        />
      ) : null}
      {step === 3 ? (
        <StepParcels
          value={data.parcels}
          farmAreaHa={farmAreaHa}
          cropOptions={cropOptions}
          onChange={(parcels) => void save({ parcels }, 3)}
          onValidate={() => setStep(4)}
          onSkip={() => void save({ parcels: [] }, 4)}
          onBack={() => setStep(2)}
        />
      ) : null}
      {step === 4 ? (
        <StepCrops
          value={data.crops}
          cropOptions={cropOptions}
          suggestedSeason={suggestedSeason}
          hasParcels={data.parcels.length > 0}
          onValidate={(crops) => void save({ crops }, 5)}
          onBack={() => setStep(3)}
          onLater={goLater}
        />
      ) : null}
      {step === 5 ? (
        <StepConsent
          data={data}
          cropNames={cropNames}
          submitting={submitting}
          error={submitError}
          onEdit={setStep}
          onSubmit={handleSubmit}
          onBack={() => setStep(4)}
        />
      ) : null}
      {step === 6 && data.result ? (
        <StepDone
          userId={userId}
          result={data.result}
          farmerLabel={farmerLabel}
          sync={sync}
          onAnother={() => window.history.replaceState(null, "", "/agent/enregistrer")}
        />
      ) : null}
    </div>
  );
}
