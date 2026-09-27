import type { AgentDatabase, Draft } from "@/lib/offline/db";
import {
  EMPTY_ENROLMENT,
  firstIncompleteStep,
  type EnrolmentData,
  type EnrolmentStep,
} from "./enrolment-types";

// Lecture et écriture du brouillon d'enregistrement. Chaque écran validé est écrit aussitôt :
// fermer l'application ou perdre le réseau ne perd jamais une saisie (registre §0).

export interface EnrolmentDraft {
  id: string;
  step: EnrolmentStep;
  data: EnrolmentData;
  status: Draft["status"];
  createdAt: string;
  updatedAt: string;
}

function toEnrolmentDraft(draft: Draft): EnrolmentDraft {
  return {
    id: draft.id,
    step: Math.min(Math.max(draft.step, 0), 6) as EnrolmentStep,
    data: { ...EMPTY_ENROLMENT, ...(draft.data as Partial<EnrolmentData>) },
    status: draft.status,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
}

function emptyDraft(id: string): Draft {
  const now = new Date().toISOString();
  return {
    id,
    kind: "FARM_ENROLMENT",
    step: 0,
    data: { ...EMPTY_ENROLMENT },
    status: "IN_PROGRESS",
    createdAt: now,
    updatedAt: now,
  };
}

export async function createEnrolmentDraft(db: AgentDatabase): Promise<EnrolmentDraft> {
  const draft = emptyDraft(crypto.randomUUID());
  await db.drafts.add(draft);
  return toEnrolmentDraft(draft);
}

/**
 * Brouillon d'enregistrement de cet identifiant : repris s'il existe, créé vide sinon. Une seule
 * transaction : deux ouvertures simultanées du même identifiant n'en créent qu'un. Null si
 * l'identifiant est celui d'un autre type de brouillon.
 */
export async function openEnrolmentDraft(
  db: AgentDatabase,
  id: string,
): Promise<EnrolmentDraft | null> {
  return db.transaction("rw", db.drafts, async () => {
    const existing = await db.drafts.get(id);
    if (existing) return existing.kind === "FARM_ENROLMENT" ? toEnrolmentDraft(existing) : null;
    const draft = emptyDraft(id);
    await db.drafts.add(draft);
    return toEnrolmentDraft(draft);
  });
}

export async function loadEnrolmentDraft(
  db: AgentDatabase,
  id: string,
): Promise<EnrolmentDraft | null> {
  const draft = await db.drafts.get(id);
  return draft && draft.kind === "FARM_ENROLMENT" ? toEnrolmentDraft(draft) : null;
}

/** Enregistre une section validée et avance l'étape atteinte si l'écran suivant est plus loin. */
export async function saveEnrolmentSection(
  db: AgentDatabase,
  id: string,
  patch: Partial<EnrolmentData>,
  reachedStep: EnrolmentStep,
): Promise<EnrolmentDraft | null> {
  const existing = await db.drafts.get(id);
  if (!existing) return null;
  const data: EnrolmentData = {
    ...EMPTY_ENROLMENT,
    ...(existing.data as Partial<EnrolmentData>),
    ...patch,
  };
  const updated: Draft = {
    ...existing,
    data: data as unknown as Record<string, unknown>,
    step: Math.max(existing.step, reachedStep),
    farmerId: data.farmer?.existingFarmerId ?? existing.farmerId,
    updatedAt: new Date().toISOString(),
  };
  await db.drafts.put(updated);
  return toEnrolmentDraft(updated);
}

export async function markEnrolmentSubmitted(
  db: AgentDatabase,
  id: string,
  result: EnrolmentData["result"],
  farmId: string,
): Promise<void> {
  await db.drafts
    .where("id")
    .equals(id)
    .modify((draft) => {
      draft.status = "SUBMITTED";
      draft.step = 6;
      draft.farmId = farmId;
      draft.data = { ...(draft.data as Partial<EnrolmentData>), result } as Record<string, unknown>;
      draft.updatedAt = new Date().toISOString();
    });
}

export async function abandonEnrolmentDraft(db: AgentDatabase, id: string): Promise<void> {
  await db.drafts.update(id, { status: "ABANDONED", updatedAt: new Date().toISOString() });
}

export interface EnrolmentDraftSummary {
  id: string;
  farmerLabel: string;
  communeName: string | null;
  step: EnrolmentStep;
  resumeStep: EnrolmentStep;
  updatedAt: string;
}

/** Brouillons en cours, les plus récents en premier, pour la page « En cours ». */
export async function listEnrolmentDrafts(db: AgentDatabase): Promise<EnrolmentDraftSummary[]> {
  const rows = await db.drafts
    .where("kind")
    .equals("FARM_ENROLMENT")
    .and((draft) => draft.status === "IN_PROGRESS")
    .reverse()
    .sortBy("updatedAt");
  return rows.map((row) => {
    const draft = toEnrolmentDraft(row);
    const farmer = draft.data.farmer;
    const farmerLabel =
      farmer?.mode === "EXISTING"
        ? (farmer.existingFarmerName ?? "Producteur connu")
        : [farmer?.firstName, farmer?.lastName].filter(Boolean).join(" ") ||
          "Producteur non renseigné";
    return {
      id: draft.id,
      farmerLabel,
      communeName: draft.data.location?.communeName ?? null,
      step: draft.step,
      resumeStep: firstIncompleteStep(draft.data),
      updatedAt: draft.updatedAt,
    };
  });
}
