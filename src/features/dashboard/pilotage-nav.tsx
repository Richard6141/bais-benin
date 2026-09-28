"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FeedbackButton } from "@/features/feedback/feedback-button";
import { cn } from "@/lib/utils";

// Navigation du centre de pilotage, à deux niveaux par thème (portail officiel : onglets puis
// sous-onglets, pas de défilement horizontal cachant des rubriques). Les règles d'alerte ont leur
// entrée : elles se gouvernent depuis le pilotage, pas seulement depuis le centre d'alertes. Une
// fiche (commune, alerte, règle) active l'entrée de sa rubrique.
const GROUPS = [
  {
    label: "Situation",
    entries: [
      { href: "/pilotage", label: "Vue nationale", match: ["/pilotage", "/pilotage/fiche"] },
      { href: "/pilotage/veille", label: "Veille", match: ["/pilotage/veille"] },
      {
        href: "/pilotage/territoires",
        label: "Territoires",
        match: ["/pilotage/territoires", "/pilotage/communes"],
      },
      { href: "/pilotage/alertes", label: "Alertes", match: ["/pilotage/alertes"] },
      {
        href: "/pilotage/signalements",
        label: "Signalements",
        match: ["/pilotage/signalements"],
      },
      { href: "/pilotage/demandes", label: "Demandes", match: ["/pilotage/demandes"] },
      // Déclarations de sinistre après un feu (ADR-0038 §2).
      { href: "/pilotage/sinistres", label: "Sinistres", match: ["/pilotage/sinistres"] },
    ],
  },
  {
    label: "Cultures",
    entries: [
      {
        href: "/pilotage/etat-des-cultures",
        label: "État des cultures",
        match: ["/pilotage/etat-des-cultures"],
      },
      {
        href: "/pilotage/cultures",
        label: "Surfaces satellite",
        match: ["/pilotage/cultures"],
      },
      { href: "/pilotage/previsions", label: "Prévisions", match: ["/pilotage/previsions"] },
      {
        href: "/pilotage/bilan-alimentaire",
        label: "Bilan alimentaire",
        match: ["/pilotage/bilan-alimentaire"],
      },
    ],
  },
  {
    label: "Producteurs",
    entries: [
      { href: "/pilotage/palmares", label: "Classement", match: ["/pilotage/palmares"] },
      { href: "/pilotage/groupes", label: "Groupes", match: ["/pilotage/groupes"] },
    ],
  },
  {
    label: "Administration",
    entries: [
      // Comptes et communes des agents de terrain (ADR-0013).
      { href: "/pilotage/agents", label: "Agents", match: ["/pilotage/agents"] },
      { href: "/pilotage/qualite", label: "Qualité", match: ["/pilotage/qualite"] },
      { href: "/pilotage/regles", label: "Règles", match: ["/pilotage/regles"] },
      { href: "/pilotage/assistant", label: "Assistant", match: ["/pilotage/assistant"] },
      { href: "/pilotage/avis", label: "Avis des testeurs", match: ["/pilotage/avis"] },
    ],
  },
] as const;

export function isActiveEntry(pathname: string, match: readonly string[]): boolean {
  return match.some((prefix) =>
    prefix === "/pilotage"
      ? pathname === prefix
      : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function activeGroupIndex(pathname: string): number {
  const index = GROUPS.findIndex((group) =>
    group.entries.some((entry) => isActiveEntry(pathname, entry.match)),
  );
  return index === -1 ? 0 : index;
}

/** Avis des testeurs encore nouveaux : compteur de l'entrée « Avis des testeurs ». */
const FEEDBACK_HREF = "/pilotage/avis";

export function PilotageNav({ newFeedback = 0 }: { newFeedback?: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const groupIndex = activeGroupIndex(pathname);
  const group = GROUPS[groupIndex] ?? GROUPS[0];
  const current = GROUPS.map((candidate) =>
    (candidate.entries as readonly { href: string; match: readonly string[] }[]).find((entry) =>
      isActiveEntry(pathname, entry.match),
    ),
  ).find(Boolean);
  const currentHref = current?.href;

  return (
    <nav aria-label="Centre de pilotage" className="flex flex-col gap-1 print:hidden">
      {/* Grand écran (1024 px et plus) : les thèmes, puis les rubriques du thème actif. */}
      <ul className="hidden border-b lg:flex">
        {GROUPS.map((candidate, index) => (
          <li key={candidate.label} className="shrink-0">
            <Link
              href={candidate.entries[0].href as Route}
              aria-current={index === groupIndex ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex h-11 items-center border-b-2 px-4 text-xs font-bold tracking-wide whitespace-nowrap uppercase transition-colors",
                index === groupIndex
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {candidate.label}
            </Link>
          </li>
        ))}
      </ul>
      <ul className="hidden border-b lg:flex">
        {group.entries.map((entry) => {
          const active = isActiveEntry(pathname, entry.match);
          return (
            <li key={entry.href} className="shrink-0">
              <Link
                href={entry.href as Route}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-10 items-center border-b-2 px-3 text-sm font-semibold whitespace-nowrap transition-colors",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {entry.label}
                {entry.href === FEEDBACK_HREF && newFeedback > 0 ? (
                  <span className="tabular ml-1.5 rounded-sm bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                    {newFeedback}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
        <li className="ml-auto shrink-0 self-center">
          <FeedbackButton />
        </li>
      </ul>

      {/* Téléphone et tablette : une seule liste des rubriques, groupées par thème. Une ligne
          au lieu de quatre, et aucune rubrique cachée derrière un défilement. */}
      <label className="flex flex-col gap-1 pb-2 lg:hidden">
        <span className="text-sm font-medium text-muted-foreground">Rubrique du pilotage</span>
        <select
          className="h-11 rounded-sm border border-primary bg-background px-3 text-base font-semibold text-primary"
          value={currentHref ?? ""}
          onChange={(event) => {
            if (event.target.value) router.push(event.target.value as Route);
          }}
        >
          {!currentHref ? <option value="">Choisir une rubrique</option> : null}
          {GROUPS.map((candidate) => (
            <optgroup key={candidate.label} label={candidate.label}>
              {candidate.entries.map((entry) => (
                <option key={entry.href} value={entry.href}>
                  {entry.href === FEEDBACK_HREF && newFeedback > 0
                    ? `${entry.label} (${newFeedback} nouveaux)`
                    : entry.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <FeedbackButton className="self-end lg:hidden" />
    </nav>
  );
}
