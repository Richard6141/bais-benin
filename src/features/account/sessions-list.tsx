"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";

export interface SessionSummary {
  id: string;
  token: string;
  current: boolean;
  createdAt: string;
  expiresAt: string;
  userAgent: string | null;
}

const VISIBLE_LIMIT = 5;

// Appareils connectés : l'utilisateur peut révoquer une session (téléphone perdu, poste
// partagé) ou tout déconnecter sauf l'appareil courant en un geste.
export function SessionsList({ sessions }: { sessions: SessionSummary[] }) {
  const router = useRouter();
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const ordered = [...sessions].sort((a, b) => Number(b.current) - Number(a.current));
  const visible = showAll ? ordered : ordered.slice(0, VISIBLE_LIMIT);
  const others = sessions.filter((session) => !session.current).length;

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y rounded-lg border">
        {visible.map((session) => (
          <li
            key={session.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">
                {describeUserAgent(session.userAgent)}
                {session.current ? (
                  <Badge variant="success" className="ml-2">
                    Cet appareil
                  </Badge>
                ) : null}
              </span>
              <span className="text-xs text-muted-foreground">
                Connecté le {formatDate(session.createdAt)}, expire le{" "}
                {formatDate(session.expiresAt)}
              </span>
            </div>
            {!session.current ? (
              <Button
                variant="outline"
                size="sm"
                disabled={pendingToken === session.token}
                onClick={async () => {
                  setPendingToken(session.token);
                  await authClient.revokeSession({ token: session.token });
                  setPendingToken(null);
                  router.refresh();
                }}
              >
                Déconnecter
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        {sessions.length > VISIBLE_LIMIT ? (
          <Button variant="ghost" size="sm" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Réduire" : `Voir les ${sessions.length - VISIBLE_LIMIT} autres`}
          </Button>
        ) : null}
        {others > 0 ? (
          <Button
            variant="outline"
            size="sm"
            disabled={revokingOthers}
            onClick={async () => {
              setRevokingOthers(true);
              await authClient.revokeOtherSessions();
              setRevokingOthers(false);
              router.refresh();
            }}
          >
            {revokingOthers ? "Déconnexion en cours" : `Déconnecter les ${others} autres appareils`}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "Appareil inconnu";
  if (/android/i.test(userAgent)) return "Téléphone Android";
  if (/iphone|ipad/i.test(userAgent)) return "iPhone ou iPad";
  if (/windows/i.test(userAgent)) return "Ordinateur Windows";
  if (/mac os/i.test(userAgent)) return "Ordinateur Mac";
  if (/linux/i.test(userAgent)) return "Ordinateur Linux";
  return "Navigateur";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("fr-BJ", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}
