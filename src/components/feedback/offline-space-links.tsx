"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

/** Clé de l'espace ouvert en dernier sur cet appareil, écrite par la navigation de l'espace. */
export const LAST_SPACE_KEY = "bais:dernier-espace";

const SPACES = {
  "/agent": "Retour à ma tournée",
  "/agriculteur": "Retour à mon exploitation",
} as const;

type SpaceHref = keyof typeof SPACES;

function readLastSpace(): SpaceHref | null {
  try {
    const value = window.localStorage.getItem(LAST_SPACE_KEY);
    return value && value in SPACES ? (value as SpaceHref) : null;
  } catch {
    return null;
  }
}

const noSubscription = () => () => {};

// Boutons de la page hors connexion : l'espace ouvert en dernier sur cet appareil, seul. La page
// est servie sans réseau ni session, elle ne connaît donc le rôle que par ce repère local ; sans
// lui (premier passage, stockage bloqué), les deux espaces qui fonctionnent hors ligne sont
// proposés.
export function OfflineSpaceLinks() {
  const last = useSyncExternalStore(noSubscription, readLastSpace, () => null);
  const spaces = last ? [last] : (Object.keys(SPACES) as SpaceHref[]);
  return (
    <div className="flex w-full flex-col gap-3">
      {spaces.map((href, index) => (
        <Button
          key={href}
          asChild
          variant={index === 0 ? "default" : "outline"}
          className="h-14 w-full text-base"
        >
          <Link href={href}>{SPACES[href]}</Link>
        </Button>
      ))}
    </div>
  );
}
