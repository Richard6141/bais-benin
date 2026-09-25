"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";
import { deleteAgentDatabase, getAgentDatabase } from "@/lib/offline/db";
import { outboxCounts } from "@/lib/offline/outbox";

// A3 : noms des caches posés par le service worker (src/app/sw.ts) qui contiennent des
// données propres à un compte. Sur un téléphone partagé entre agents, un agent B qui se
// connecte après un agent A ne doit jamais pouvoir lire les données de A restées en cache
// (ou dans IndexedDB) après sa déconnexion : on les vide explicitement ici plutôt que
// d'attendre leur expiration naturelle.
const ACCOUNT_SCOPED_CACHES = ["bais-registry-data", "bais-spaces-pages", "bais-spaces-rsc"];

async function clearAccountScopedCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  await Promise.all(ACCOUNT_SCOPED_CACHES.map((name) => caches.delete(name).catch(() => false)));
}

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="ghost"
      size="sm"
      className={className}
      disabled={pending}
      onClick={async () => {
        const userId = session?.user.id;

        // Une saisie encore dans la file de synchronisation serait perdue : la base locale est
        // vidée à la déconnexion (ligne suivante), donc on prévient avant d'agir.
        if (userId) {
          const { pending: awaitingSync } = await outboxCounts(getAgentDatabase(userId));
          if (awaitingSync > 0) {
            const confirmed = window.confirm(
              "Des saisies non envoyées seront perdues, continuer ?",
            );
            if (!confirmed) return;
          }
        }

        setPending(true);
        await authClient.signOut();
        await clearAccountScopedCaches();
        if (userId) await deleteAgentDatabase(userId);
        router.replace("/");
        router.refresh();
      }}
    >
      <LogOut aria-hidden />
      Se déconnecter
    </Button>
  );
}
