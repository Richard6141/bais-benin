// Masquage des données personnelles saisies dans une question (revue de sécurité, étape 8) :
// numéros de téléphone et NPI, et adresses e-mail. Appliqué avant l'envoi au modèle et au modèle de plongement, et avant
// l'écriture en base : ni le fournisseur ni le journal ne voient ces numéros.

// Suite continue de 8 à 13 chiffres (NPI, numéro saisi d'un bloc), ou numéro écrit par paires
// (« 01 97 12 34 56 », « +229 97 12 34 56 »). Les nombres agronomiques (« 30 000 »,
// « 2026-2027 ») ne correspondent à aucune des deux formes.
const LONG_NUMBER = /(?<![\d])(?:\+\s?229[\s.-]?)?(?:\d{8,13}|(?:\d{2}[\s.-]){3,4}\d{2})(?![\d])/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

export const REDACTED_NUMBER = "[numéro masqué]";
export const REDACTED_EMAIL = "[adresse masquée]";

export function redactPersonalData(text: string): string {
  return text.replace(EMAIL, REDACTED_EMAIL).replace(LONG_NUMBER, REDACTED_NUMBER);
}
