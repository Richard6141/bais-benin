"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Navigation du centre de pilotage. Les règles d'alerte ont leur entrée : elles se gouvernent
// depuis le pilotage, pas seulement depuis le centre d'alertes. Une fiche (commune, alerte,
// règle) active l'entrée de sa rubrique.
const ENTRIES = [
  {
    href: "/pilotage",
    label: "Vue nationale",
    match: ["/pilotage", "/pilotage/fiche"],
  },
  {
    href: "/pilotage/territoires",
    label: "Territoires",
    match: ["/pilotage/territoires", "/pilotage/communes"],
  },
  {
    href: "/pilotage/qualite",
    label: "Qualité des données",
    match: ["/pilotage/qualite"],
  },
  { href: "/pilotage/alertes", label: "Alertes", match: ["/pilotage/alertes"] },
  { href: "/pilotage/signalements", label: "Signalements", match: ["/pilotage/signalements"] },
  {
    href: "/pilotage/regles",
    label: "Règles d'alerte",
    match: ["/pilotage/regles"],
  },
  {
    href: "/pilotage/assistant",
    label: "Assistant",
    match: ["/pilotage/assistant"],
  },
] as const;

export function isActiveEntry(pathname: string, match: readonly string[]): boolean {
  return match.some((prefix) =>
    prefix === "/pilotage"
      ? pathname === prefix
      : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function PilotageNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Centre de pilotage"
      className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 print:hidden"
    >
      <ul className="flex border-b">
        {ENTRIES.map((entry) => {
          const active = isActiveEntry(pathname, entry.match);
          return (
            <li key={entry.href} className="shrink-0">
              <Link
                href={entry.href as Route}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-11 items-center border-b-2 px-3 text-xs font-semibold tracking-wide whitespace-nowrap uppercase transition-colors",
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
    </nav>
  );
}
