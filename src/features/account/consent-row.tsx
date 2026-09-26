"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { setConsentAction, type ConsentActionState } from "./consent-actions";

const initialState: ConsentActionState = { status: "idle" };

export interface ConsentRowProps {
  consent: "WHATSAPP";
  title: string;
  description: string;
  /** Date de l'accord, déjà formulée (« 26 septembre 2026 »), ou null sans accord. */
  grantedOn: string | null;
}

// Un accord du producteur : ce qu'il autorise, où il en est, et le bouton pour le donner ou le
// retirer. Le changement est immédiat et journalisé.
export function ConsentRow({ consent, title, description, grantedOn }: ConsentRowProps) {
  const [state, action, pending] = useActionState(setConsentAction, initialState);
  const granted = grantedOn !== null;
  return (
    <form
      action={action}
      className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
    >
      <input type="hidden" name="consent" value={consent} />
      <input type="hidden" name="granted" value={granted ? "0" : "1"} />
      <div className="flex max-w-prose flex-col gap-1">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">{description}</span>
        <span className="font-medium">
          {granted ? `Accord donné le ${grantedOn}.` : "Vous n'avez pas donné votre accord."}
        </span>
        {state.status === "error" ? (
          <span role="alert" className="text-destructive">
            {state.message}
          </span>
        ) : state.status === "success" ? (
          <span role="status" className="text-muted-foreground">
            {state.message}
          </span>
        ) : null}
      </div>
      <Button
        type="submit"
        variant={granted ? "outline" : "default"}
        disabled={pending}
        className="shrink-0"
      >
        {granted ? "Retirer mon accord" : "Donner mon accord"}
      </Button>
    </form>
  );
}
