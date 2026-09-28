import type { ReactNode } from "react";
import { requireRole } from "@/features/auth/session";
import { AgentShell } from "@/features/registry/agent/agent-shell";
import { isDemoPhone } from "@/lib/auth/phone";
import { scopeKeyFor } from "@/modules/registry";

// Toutes les pages de l'espace agent partagent la navigation et la synchronisation.
export default async function AgentLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("AGENT_AGRICULTURE");
  const scopeKey = await scopeKeyFor(user.actor);
  return (
    <AgentShell userId={user.id} scopeKey={scopeKey} demo={isDemoPhone(user.phoneNumber ?? "")}>
      {children}
    </AgentShell>
  );
}
