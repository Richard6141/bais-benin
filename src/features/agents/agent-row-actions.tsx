"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AgentScopeView, TerritoryOption } from "@/modules/identity/agents";
import { revokeAgentAction, updateAgentScopeAction, type AgentActionState } from "./actions";
import { ScopePicker } from "./scope-picker";

const idle: AgentActionState = { status: "idle" };

type Mode = "none" | "scope" | "revoke";

// Gestes du ministère sur un agent : changer son périmètre, ou lui retirer l'accès après une
// confirmation qui dit ce que cela change sur le terrain.
export function AgentRowActions({
  userId,
  name,
  scopes,
  territories,
}: {
  userId: string;
  name: string;
  scopes: readonly AgentScopeView[];
  territories: readonly TerritoryOption[];
}) {
  const [mode, setMode] = useState<Mode>("none");
  const [scopeState, scopeAction, scopePending] = useActionState(
    async (previous: AgentActionState, formData: FormData) => {
      const result = await updateAgentScopeAction(previous, formData);
      if (result.status === "success") setMode("none");
      return result;
    },
    idle,
  );
  const [revokeState, revokeAction, revokePending] = useActionState(revokeAgentAction, idle);

  if (mode === "scope") {
    return (
      <form action={scopeAction} className="flex flex-col gap-3 border-t pt-3">
        <input type="hidden" name="userId" value={userId} />
        <ScopePicker
          territories={territories}
          initialCommuneIds={scopes.filter((s) => s.scopeType === "COMMUNE").map((s) => s.scopeId)}
          initialDepartementIds={scopes
            .filter((s) => s.scopeType === "DEPARTEMENT")
            .map((s) => s.scopeId)}
        />
        {scopeState.status === "error" ? (
          <p role="alert" className="text-sm text-destructive">
            {scopeState.message}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={scopePending}>
            Enregistrer le périmètre
          </Button>
          <Button type="button" variant="outline" onClick={() => setMode("none")}>
            Annuler
          </Button>
        </div>
      </form>
    );
  }

  if (mode === "revoke") {
    return (
      <form action={revokeAction} className="flex flex-col gap-3 border-t pt-3">
        <input type="hidden" name="userId" value={userId} />
        <p className="text-sm">
          Retirer l&apos;accès de <span className="font-semibold">{name}</span> ? Ce compte ne
          pourra plus enregistrer ni envoyer ce qui reste sur son téléphone : demandez une
          synchronisation avant si possible.
        </p>
        {revokeState.status === "error" ? (
          <p role="alert" className="text-sm text-destructive">
            {revokeState.message}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="destructive" disabled={revokePending}>
            Confirmer le retrait
          </Button>
          <Button type="button" variant="outline" onClick={() => setMode("none")}>
            Annuler
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {scopeState.status === "success" ? (
        <p role="status" className="text-sm font-medium text-forest">
          {scopeState.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setMode("scope")}>
          Changer le périmètre
        </Button>
        <Button
          type="button"
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={() => setMode("revoke")}
        >
          Retirer l&apos;accès
        </Button>
      </div>
    </div>
  );
}
