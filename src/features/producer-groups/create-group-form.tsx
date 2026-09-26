"use client";

import { useActionState } from "react";
import { HelpTip } from "@/components/forms/help-tip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionFeedback } from "./action-feedback";
import { createGroupAction, type GroupActionState } from "./actions";

const initialState: GroupActionState = { status: "idle" };

export interface GroupCriteriaFields {
  cropCode: string;
  campaignCode: string;
  departementCode?: string;
  communeCode?: string;
  metric: string;
  verifiedOnly: boolean;
  limit: number;
}

// Former un groupe avec le palmarès affiché : les critères partent en champs cachés, le serveur
// recalcule la liste. Une ligne, sous les critères : nom proposé, modifiable.
export function CreateGroupForm({
  criteria,
  suggestedName,
  count,
  maxNameLength,
}: {
  criteria: GroupCriteriaFields;
  suggestedName: string;
  /** Producteurs affichés, qui formeront le groupe. */
  count: number;
  maxNameLength: number;
}) {
  const [state, action, pending] = useActionState(createGroupAction, initialState);
  return (
    <form
      action={action}
      aria-labelledby="former-groupe"
      className="flex flex-col gap-2 rounded-sm border p-4 print:hidden"
    >
      {Object.entries(criteria).map(([key, value]) =>
        value === undefined ? null : (
          <input
            key={key}
            type="hidden"
            name={key}
            value={typeof value === "boolean" ? (value ? "1" : "0") : String(value)}
          />
        ),
      )}
      <div className="flex items-center gap-1">
        <h2 id="former-groupe" className="font-semibold">
          Former un groupe avec ces {count} producteurs
        </h2>
        <HelpTip label="Former un groupe">
          Les producteurs affichés, dans l&apos;ordre du classement, deviennent un groupe nommé à
          consulter, exporter et à qui écrire sur WhatsApp. La liste est recalculée par le serveur
          avec ces critères.
        </HelpTip>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="nom-groupe">Nom du groupe</Label>
          <Input
            id="nom-groupe"
            name="name"
            defaultValue={suggestedName}
            required
            minLength={3}
            maxLength={maxNameLength}
            autoComplete="off"
            className="h-11"
          />
        </div>
        <Button type="submit" className="h-11" disabled={pending}>
          Créer le groupe
        </Button>
      </div>
      <ActionFeedback state={state} />
    </form>
  );
}
