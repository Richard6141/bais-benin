import type { AssistanceCategory, FieldReportType } from "@/generated/prisma/client";

// Textes des messages de suivi envoyés au producteur sur WhatsApp. Courts, sans donnée d'un tiers
// (ni nom ni numéro d'agent) : l'objet, la date, la suite donnée et, pour une réponse ou un motif,
// les mots de l'agent, tronqués. Le détail reste dans l'espace BAIS du producteur.

const MAX_QUOTE = 280;

const ASSISTANCE_CATEGORY: Record<AssistanceCategory, string> = {
  ADVICE: "conseil",
  INPUT: "intrants",
  DISPUTE: "litige",
  DISASTER: "sinistre",
  OTHER: "autre demande",
};

const REPORT_TYPE: Record<FieldReportType, string> = {
  PEST: "ravageur",
  CROP_DISEASE: "maladie des cultures",
  ANIMAL_DISEASE: "maladie animale",
  OTHER: "autre problème",
};

const dayMonth = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Africa/Porto-Novo",
});

// Nettoyage de la citation (revue de sécurité R5) : le message part du numéro officiel, un lien ou
// une adresse y serait pris pour une consigne de l'État (hameçonnage depuis un compte d'agent
// compromis). Caractères de contrôle, invisibles et d'inversion du sens d'écriture retirés : ils
// servent à maquiller un texte.
const INVISIBLE = /[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁠-⁤﻿]/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const LINK =
  /\b(?:https?:\/\/|www\.)\S+|\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|bj|me|ly|io|info|biz|link|app|xyz|site|online|co|gl)\b(?:\/\S*)?/gi;

/** Texte sans caractère de contrôle, invisible ni d'inversion ; les sauts de ligne restent. */
export function withoutInvisible(text: string): string {
  return text.replace(INVISIBLE, "");
}

/** Vrai si le texte contient un lien web ou une adresse e-mail (search ignore l'état /g). */
export function containsLinkOrAddress(text: string): boolean {
  return text.search(LINK) !== -1 || text.search(EMAIL) !== -1;
}

/** Citation d'une réponse d'agent : sans lien ni adresse, sur une ligne, tronquée. */
export function quote(text: string): string {
  const flat = text
    .replace(INVISIBLE, "")
    .replace(EMAIL, "[adresse retirée]")
    .replace(LINK, "[lien retiré]")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length <= MAX_QUOTE ? flat : `${flat.slice(0, MAX_QUOTE - 1).trimEnd()}…`;
}

export interface AssistanceSubject {
  category: AssistanceCategory;
  requestedAt: Date;
}

export function assistanceTakenText(subject: AssistanceSubject): string {
  return (
    `BAIS : votre demande (${ASSISTANCE_CATEGORY[subject.category]}) du ` +
    `${dayMonth.format(subject.requestedAt)} est prise en charge par un agent de votre commune. ` +
    "Suivez-la dans votre espace BAIS, rubrique « Mes demandes »."
  );
}

export function assistanceResolvedText(subject: AssistanceSubject & { note: string }): string {
  return (
    `BAIS : votre demande (${ASSISTANCE_CATEGORY[subject.category]}) du ` +
    `${dayMonth.format(subject.requestedAt)} est résolue. Réponse de l'agent : ` +
    `« ${quote(subject.note)} ». Détails dans votre espace BAIS, rubrique « Mes demandes ».`
  );
}

export interface ReportSubject {
  type: FieldReportType;
  observedAt: Date;
}

export function reportConfirmedText(subject: ReportSubject): string {
  return (
    `BAIS : un agent a confirmé votre signalement (${REPORT_TYPE[subject.type]}) du ` +
    `${dayMonth.format(subject.observedAt)}. Il compte pour la surveillance de votre zone : ` +
    "si d'autres producteurs voisins signalent le même problème, une alerte sera lancée."
  );
}

export function reportDismissedText(subject: ReportSubject & { note: string | null }): string {
  const reason = subject.note ? ` Motif : « ${quote(subject.note)} ».` : "";
  return (
    `BAIS : votre signalement (${REPORT_TYPE[subject.type]}) du ` +
    `${dayMonth.format(subject.observedAt)} a été écarté après vérification.${reason} ` +
    "Si le problème continue, signalez-le de nouveau depuis votre espace BAIS."
  );
}
