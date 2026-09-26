"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
    ],
  },
  {
    label: "Cultures et satellite",
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
    ],
  },
  {
    label: "Producteurs",
    entries: [
      { href: "/pilotage/palmares", label: "Palmarès", match: ["/pilotage/palmares"] },
      { href: "/pilotage/groupes", label: "Groupes", match: ["/pilotage/groupes"] },
    ],
  },
  {
    label: "Administration",
    entries: [
      { href: "/pilotage/qualite", label: "Qualité", match: ["/pilotage/qualite"] },
      { href: "/pilotage/regles", label: "Règles", match: ["/pilotage/regles"] },
      { href: "/pilotage/assistant", label: "Assistant", match: ["/pilotage/assistant"] },
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

export function PilotageNav() {
  const pathname = usePathname();
  const router = useRouter();
  const groupIndex = activeGroupIndex(pathname);
  const group = GROUPS[groupIndex] ?? GROUPS[0];

  return (
    <nav aria-label="Centre de pilotage" className="flex flex-col gap-1 print:hidden">
      {/* Thèmes : visibles à partir de 1280 px, choix par menu déroulant en dessous. */}
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
                  "-mb-px inline-flex h-9 items-center border-b-2 px-3 text-xs font-semibold tracking-wide whitespace-nowrap uppercase transition-colors",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {entry.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Téléphone et tablette : un menu déroulant par thème, pas de défilement caché. */}
      <div className="grid grid-cols-2 gap-2 pb-2 lg:hidden">
        {GROUPS.map((candidate) => {
          const currentEntry = candidate.entries.find((entry) =>
            isActiveEntry(pathname, entry.match),
          );
          return (
            <label key={candidate.label} className="flex flex-col gap-1">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {candidate.label}
              </span>
              <select
                aria-label={candidate.label}
                className={cn(
                  "h-10 rounded-sm border bg-background px-2 text-sm",
                  currentEntry && "border-primary text-primary",
                )}
                value={currentEntry?.href ?? ""}
                onChange={(event) => {
                  if (event.target.value) router.push(event.target.value as Route);
                }}
              >
                {!currentEntry ? <option value="">Choisir</option> : null}
                {candidate.entries.map((entry) => (
                  <option key={entry.href} value={entry.href}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </nav>
  );
}
