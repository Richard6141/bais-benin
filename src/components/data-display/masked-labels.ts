// Libellés du secret statistique (docs/06 §3, règle 4), sans directive client : lisibles par les
// composants serveur, la logique pure et les exports.

/** Seuil : en dessous de 5 exploitations résumées, la valeur n'est pas publiée. */
export const K_ANONYMITY = 5;
export const MASKED_VALUE_LABEL = "moins de 5";
export const MASKED_VALUE_EXPLANATION =
  "Secret statistique : ce chiffre résume moins de 5 exploitations. Il n'est ni affiché ni exporté, pour qu'aucun producteur ne puisse être reconnu.";
