// Parcours « Premiers pas » par rôle (plan d'action, chantier A) : une suite d'étapes qui fait
// découvrir l'outil sans aide, « si je fais ceci, je peux ensuite faire cela ». Chaque étape ouvre
// un écran et y désigne l'élément à toucher. Données pures : testées sans navigateur.

export type TourRole = "ministere" | "agent" | "producteur";

export interface TourStep {
  id: string;
  title: string;
  /** Ce que l'étape apprend, en une phrase, affiché dans la bulle de l'écran. */
  why: string;
  /** Écran de l'étape ; sa visite marque l'étape faite. */
  href: string;
  /** Élément à mettre en évidence (sélecteur CSS) ; à défaut, le titre de la page. */
  target?: string;
}

export const TOURS: Record<TourRole, readonly TourStep[]> = {
  ministere: [
    {
      id: "situation",
      title: "Lire la situation du jour",
      why: "La phrase du jour et « À faire maintenant » disent ce qui demande votre attention.",
      href: "/pilotage",
      target: "[data-tour='actions']",
    },
    {
      id: "veille",
      title: "Ouvrir la veille",
      why: "Les feux, les alertes et les foyers du pays, mis à jour chaque minute.",
      href: "/pilotage/veille",
      target: "[data-tour='veille-carte']",
    },
    {
      id: "carte",
      title: "Descendre jusqu'à un champ",
      why: "Touchez une commune, puis rapprochez-vous : chaque champ ouvre sa fiche et son producteur.",
      href: "/pilotage?onglet=carte",
      target: "#carte",
    },
    {
      id: "etat",
      title: "Lire l'état des cultures",
      why: "La vigueur des cultures vue par le satellite, culture par culture.",
      href: "/pilotage/etat-des-cultures",
    },
    {
      id: "surfaces",
      title: "Comparer satellite et registre",
      why: "Les surfaces estimées par satellite face aux surfaces déclarées.",
      href: "/pilotage/cultures",
    },
    {
      id: "groupe",
      title: "Former un groupe des meilleurs producteurs",
      why: "Classez les producteurs d'une culture, puis faites-en un groupe à suivre et à joindre.",
      href: "/pilotage/palmares",
      target: "[data-tour='former-groupe']",
    },
    {
      id: "fiche",
      title: "Exporter une fiche",
      why: "La fiche de pilotage tient sur une page A4, à imprimer ou à enregistrer en PDF.",
      href: "/pilotage/fiche",
      target: "[data-tour='imprimer']",
    },
  ],
  agent: [
    {
      id: "hors-ligne",
      title: "Préparer la tournée sans réseau",
      why: "Téléchargez une fois vos communes et vos exploitations : tout marche ensuite sans connexion.",
      href: "/agent/premier-lancement",
    },
    {
      id: "enregistrer",
      title: "Enregistrer un producteur",
      why: "Producteur, position, parcelles, cultures et accord, en quelques minutes.",
      href: "/agent/enregistrer",
    },
    {
      id: "exploitations",
      title: "Retrouver une exploitation",
      why: "Recherchez par nom, téléphone ou code ; la fiche permet de relever le contour d'un champ.",
      href: "/agent/exploitations",
      target: "[data-tour='liste-exploitations']",
    },
    {
      id: "verifier",
      title: "Vérifier une exploitation",
      why: "Les déclarations sans visite attendent : la plus ancienne d'abord.",
      href: "/agent/verification",
    },
    {
      id: "demandes",
      title: "Répondre aux producteurs",
      why: "Demandes d'aide et questions arrivent dans une seule boîte.",
      href: "/agent/demandes",
    },
    {
      id: "synchroniser",
      title: "Synchroniser",
      why: "Ce qui a été saisi sans réseau part ici, et vous voyez ce qui attend encore.",
      href: "/agent/synchronisation",
    },
  ],
  producteur: [
    {
      id: "champs",
      title: "Voir mes champs",
      why: "Chaque parcelle, sa surface et ce qui y pousse, et un bouton pour la voir sur la carte.",
      href: "/agriculteur/champs",
    },
    {
      id: "alertes",
      title: "Lire mes alertes",
      why: "Pluie, sécheresse, ravageurs : ce qui concerne votre commune, avec quoi faire.",
      href: "/agriculteur/alertes",
    },
    {
      id: "recolte",
      title: "Déclarer une récolte",
      why: "Trois questions : la culture, la quantité, l'unité.",
      href: "/agriculteur/recolte",
    },
    {
      id: "signaler",
      title: "Signaler un problème",
      why: "Un ravageur ou une maladie : l'agent de votre commune vient constater.",
      href: "/agriculteur/signaler",
    },
    {
      id: "aide",
      title: "Demander de l'aide",
      why: "Conseil, intrants, sinistre : votre demande part aux agents de votre commune.",
      href: "/agriculteur/solliciter",
    },
    {
      id: "attestation",
      title: "Obtenir mon attestation",
      why: "Une attestation vérifiable qui prouve que vous cultivez, pour un crédit ou une aide.",
      href: "/agriculteur/attestation",
    },
  ],
};

/** Chemin d'une adresse d'étape, sans sa requête : « /pilotage?onglet=carte » donne « /pilotage ». */
export function stepPath(step: TourStep): string {
  return step.href.split("?")[0] ?? step.href;
}

/** Adresse qui ouvre l'étape avec sa mise en évidence (?pas=<id>). */
export function stepLink(step: TourStep): string {
  return `${step.href}${step.href.includes("?") ? "&" : "?"}pas=${step.id}`;
}

/** Étape dont l'écran est celui-ci (la plus précise d'abord), ou null. */
export function stepForPath(steps: readonly TourStep[], pathname: string): TourStep | null {
  return steps.find((step) => stepPath(step) === pathname && !step.href.includes("?")) ?? null;
}

/** Étape suivante non faite après `current`, en reprenant au début si besoin. */
export function nextStep(
  steps: readonly TourStep[],
  done: ReadonlySet<string>,
  current?: string,
): TourStep | null {
  const start = current ? steps.findIndex((step) => step.id === current) + 1 : 0;
  const ordered = [...steps.slice(start), ...steps.slice(0, start)];
  return ordered.find((step) => !done.has(step.id) && step.id !== current) ?? null;
}
