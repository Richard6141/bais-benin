"use client";

import { useActionState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { attachNpiAction, type ActionState } from "@/features/account/actions";

interface NpiFormProps {
  expectedLength: number;
}

const initialState: ActionState = { status: "idle" };

// Trois champs, un bouton. Le NPI est facultatif et expliqué : il renforce la confiance
// dans l'identité sans conditionner l'accès à la plateforme.
export function NpiForm({ expectedLength }: NpiFormProps) {
  const [state, action, pending] = useActionState(attachNpiAction, initialState);

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="npi">Numéro personnel d&apos;identification (NPI)</Label>
        <Input
          id="npi"
          name="npi"
          inputMode="numeric"
          autoComplete="off"
          placeholder={"0".repeat(expectedLength).replace(/(\d{4})(?=\d)/g, "$1 ")}
          className="tabular font-mono tracking-wider"
          aria-invalid={Boolean(state.fieldErrors?.npi)}
          aria-describedby="npi-aide"
        />
        <p id="npi-aide" className="text-sm text-muted-foreground">
          {expectedLength} chiffres, sur votre carte d&apos;identité biométrique ou votre certificat
          ANIP.
        </p>
        {state.fieldErrors?.npi ? (
          <p className="text-sm text-destructive">{state.fieldErrors.npi}</p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <div className="flex flex-col gap-2">
          <Label htmlFor="lastName">Nom de famille</Label>
          <Input
            id="lastName"
            name="lastName"
            autoComplete="family-name"
            aria-invalid={Boolean(state.fieldErrors?.lastName)}
          />
          {state.fieldErrors?.lastName ? (
            <p className="text-sm text-destructive">{state.fieldErrors.lastName}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="birthYear">Année de naissance</Label>
          <Input
            id="birthYear"
            name="birthYear"
            inputMode="numeric"
            placeholder="1985"
            maxLength={4}
          />
        </div>
      </div>
      {state.status === "error" && state.message ? (
        <Alert variant="warning">
          <AlertTitle>Enregistrement impossible</AlertTitle>
          <AlertDescription>
            <p>{state.message}</p>
          </AlertDescription>
        </Alert>
      ) : null}
      {state.status === "success" ? (
        <Alert variant="success">
          <AlertTitle>NPI enregistré</AlertTitle>
          <AlertDescription>
            <p>{state.message}</p>
          </AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" className="sm:self-start" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer mon NPI"}
      </Button>
    </form>
  );
}
