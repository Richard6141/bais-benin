"use client";

import { Upload } from "lucide-react";
import { useActionState } from "react";
import { HelpTip } from "@/components/forms/help-tip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { importOfficialStatisticsAction, type OfficialImportState } from "./actions";

const INITIAL: OfficialImportState = { status: "idle" };

// Import d'un fichier de statistiques officielles (ADR-0034) : tout ou rien, les erreurs avec
// leur numéro de ligne.
export function OfficialImportForm() {
  const [state, action, pending] = useActionState(importOfficialStatisticsAction, INITIAL);
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-center gap-1">
            <Label htmlFor="official-file">Fichier CSV</Label>
            <HelpTip label="Format du fichier">
              Colonnes : source (DSA ou FAOSTAT), campagne (2024-2025, ou l&apos;année pour
              FAOSTAT), territoire (BJ, code du département ou de la commune), culture (code ou nom
              : Maïs, riz paddy), indicateur (superficie_ha, production_t, rendement_t_ha), valeur,
              reference. Séparateur virgule ou point-virgule. Une ligne déjà importée est remplacée.
            </HelpTip>
          </div>
          <Input
            id="official-file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            className="h-11"
          />
        </div>
        <Button type="submit" className="h-11" disabled={pending}>
          <Upload aria-hidden />
          {pending ? "Import en cours" : "Importer"}
        </Button>
      </form>
      {state.status === "success" ? (
        <Alert variant="success" role="status">
          <AlertTitle>Import terminé</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {state.status === "error" ? (
        <Alert variant="critical" role="alert">
          <AlertTitle>{state.message}</AlertTitle>
          {state.errors?.length ? (
            <AlertDescription>
              <ul className="mt-1 flex flex-col gap-0.5">
                {state.errors.map((error) => (
                  <li key={`${error.line}-${error.message}`}>
                    {error.line > 0 ? `Ligne ${error.line} : ` : ""}
                    {error.message}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          ) : null}
        </Alert>
      ) : null}
    </div>
  );
}
