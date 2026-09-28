"use client";

import { useActionState, useState } from "react";
import { HelpTip } from "@/components/forms/help-tip";
import { PhoneField } from "@/components/forms/phone-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TerritoryOption } from "@/modules/identity/agents";
import { createAgentAction, type AgentActionState } from "./actions";
import { ScopePicker } from "./scope-picker";

type CreateState = AgentActionState & { round: number };

const initialState: CreateState = { status: "idle", round: 0 };

// Ouverture du compte d'un agent de terrain : qui il est (nom, NPI, numéro) et où il travaille.
// Après un compte ouvert, le formulaire revient vide pour le suivant ; après une erreur, la
// saisie reste en place pour être corrigée.
export function AgentCreateForm({ territories }: { territories: readonly TerritoryOption[] }) {
  const [state, action, pending] = useActionState(
    async (previous: CreateState, formData: FormData): Promise<CreateState> => {
      const result = await createAgentAction(previous, formData);
      return { ...result, round: previous.round + (result.status === "success" ? 1 : 0) };
    },
    initialState,
  );

  return (
    <div className="flex flex-col gap-4">
      {state.status === "success" ? (
        <p role="status" className="rounded-md bg-forest-soft p-3 text-sm font-medium text-forest">
          {state.message}
        </p>
      ) : null}
      <CreateFields
        key={state.round}
        territories={territories}
        action={action}
        pending={pending}
        error={state.status === "error" ? state.message : undefined}
      />
    </div>
  );
}

function CreateFields({
  territories,
  action,
  pending,
  error,
}: {
  territories: readonly TerritoryOption[];
  action: (formData: FormData) => void;
  pending: boolean;
  error?: string;
}) {
  const [name, setName] = useState("");
  const [npi, setNpi] = useState("");
  const [phone, setPhone] = useState("");

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="agent-nom">Nom et prénom</Label>
        <Input
          id="agent-nom"
          name="nom"
          autoComplete="off"
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="agent-npi">NPI</Label>
          <HelpTip label="NPI de l'agent">
            Numéro personnel d&apos;identification de l&apos;agent, tel qu&apos;il figure sur sa
            carte. Il est chiffré dès l&apos;enregistrement ; seuls ses deux derniers chiffres
            restent visibles.
          </HelpTip>
        </div>
        <Input
          id="agent-npi"
          name="npi"
          inputMode="numeric"
          autoComplete="off"
          placeholder="13 chiffres"
          maxLength={13}
          className="tabular text-base tracking-wide"
          value={npi}
          onChange={(event) => setNpi(event.target.value.replace(/\D/g, "").slice(0, 13))}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="agent-telephone">Téléphone WhatsApp</Label>
          <HelpTip label="Téléphone de l'agent">
            L&apos;agent reçoit sur ce numéro son code de connexion. Il se connecte ensuite comme
            tout le monde, avec son NPI et ce numéro.
          </HelpTip>
        </div>
        <PhoneField id="agent-telephone" value={phone} onChange={setPhone} required />
        <input type="hidden" name="telephone" value={phone} />
      </div>
      <ScopePicker territories={territories} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Ouverture en cours" : "Ouvrir le compte"}
      </Button>
    </form>
  );
}
