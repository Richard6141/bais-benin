import type { ReactNode } from "react";
import { requireRole } from "@/features/auth/session";
import { AgentShell } from "@/features/registry/agent/agent-shell";

// Toutes les pages de l'espace agent partagent la navigation et la synchronisation.
export default async function AgentLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("AGENT_AGRICULTURE");
  return <AgentShell userId={user.id}>{children}</AgentShell>;
}
