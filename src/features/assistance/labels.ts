import type { AssistanceCategory, AssistanceStatus } from "@/modules/assistance";

// Libellés des demandes d'assistance, communs aux écrans du producteur, de l'agent et du ministère.

export const ASSISTANCE_CATEGORY_LABELS: Record<
  AssistanceCategory,
  { label: string; hint: string }
> = {
  ADVICE: { label: "Conseil", hint: "Une question sur vos cultures, vos animaux, les dates" },
  INPUT: { label: "Intrants", hint: "Semences, engrais, produits promis ou manquants" },
  DISPUTE: { label: "Litige", hint: "Désaccord sur une terre, une vente, un contrat" },
  DISASTER: { label: "Sinistre", hint: "Inondation, incendie, récolte perdue" },
  OTHER: { label: "Autre demande", hint: "Toute autre aide attendue de l'État" },
};

export const ASSISTANCE_STATUS_LABELS: Record<
  AssistanceStatus,
  { label: string; tone: "info" | "watch" | "success" }
> = {
  RECEIVED: { label: "Reçue", tone: "info" },
  IN_PROGRESS: { label: "Prise en charge", tone: "watch" },
  RESOLVED: { label: "Résolue", tone: "success" },
};
