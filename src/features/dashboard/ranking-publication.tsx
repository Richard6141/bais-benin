"use client";

import Link from "next/link";
import type { Route } from "next";
import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  publishRankingAction,
  withdrawRankingAction,
  type PublicationActionState,
} from "./ranking-publication-actions";

const initialState: PublicationActionState = { status: "idle" };

export interface PublicationCriteria {
  cropCode: string;
  campaignCode: string;
  departementCode?: string;
  communeCode?: string;
  metric: string;
  verifiedOnly: boolean;
}

function Feedback({ state }: { state: PublicationActionState }) {
  if (state.status === "idle") return null;
  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={state.status === "error" ? "text-sm text-destructive" : "text-sm font-medium"}
    >
      {state.message}
    </p>
  );
}

// Publication du palmarès affiché : mêmes critères que le classement ci-dessus, nombre de
// lauréats au choix. Seuls les producteurs qui ont donné leur accord seront publiés.
export function PublishRankingForm({
  criteria,
  consenting,
  max,
}: {
  criteria: PublicationCriteria;
  /** Producteurs consentants parmi les lignes affichées. */
  consenting: number;
  max: number;
}) {
  const [state, action, pending] = useActionState(publishRankingAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-sm border p-4 print:hidden">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Publier ce palmarès</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Le palmarès public ne nomme que les producteurs qui ont donné leur accord depuis leur
          compte ({consenting} parmi les producteurs affichés), avec leur rang dans ce classement,
          leur commune et leur production. Jamais leur téléphone. Un producteur qui retire son
          accord disparaît aussitôt du palmarès publié.
        </p>
      </div>
      {Object.entries(criteria).map(([key, value]) =>
        value === undefined ? null : (
          <input
            key={key}
            type="hidden"
            name={key}
            value={typeof value === "boolean" ? (value ? "1" : "0") : value}
          />
        ),
      )}
      <div className="flex flex-col gap-1.5 sm:max-w-xs">
        <Label htmlFor="laureats">Nombre de lauréats à publier</Label>
        <Input
          id="laureats"
          name="laureates"
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          defaultValue={10}
          className="h-11"
        />
      </div>
      <Feedback state={state} />
      <div>
        <Button type="submit" className="h-11" disabled={pending}>
          Publier sur la page publique
        </Button>
      </div>
    </form>
  );
}

export interface PublishedRankingRow {
  id: string;
  title: string;
  publishedOn: string;
  publishedByName: string;
  withdrawnOn: string | null;
  laureates: number;
}

function WithdrawButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(withdrawRankingAction, initialState);
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="rankingId" value={id} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Retirer
      </Button>
      <Feedback state={state} />
    </form>
  );
}

// Palmarès déjà publiés : lien vers la page publique, retrait par le ministère.
export function PublishedRankingsList({ rows }: { rows: PublishedRankingRow[] }) {
  return (
    <section aria-labelledby="palmares-publies" className="flex flex-col gap-3 print:hidden">
      <h2 id="palmares-publies" className="text-lg font-semibold">
        Palmarès publiés
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun palmarès publié pour l&apos;instant.</p>
      ) : (
        <ul className="divide-y rounded-sm border">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-2 p-4 text-sm sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <span className="font-medium">{row.title}</span>
                <span className="text-muted-foreground">
                  Publié le {row.publishedOn} par {row.publishedByName} · {row.laureates} lauréat
                  {row.laureates > 1 ? "s" : ""}
                </span>
                {row.withdrawnOn ? (
                  <Badge variant="outline" className="w-fit">
                    Retiré le {row.withdrawnOn}
                  </Badge>
                ) : (
                  <Link
                    href={`/palmares/${row.id}` as Route}
                    className="w-fit underline underline-offset-4"
                  >
                    Voir la page publique
                  </Link>
                )}
              </div>
              {row.withdrawnOn ? null : <WithdrawButton id={row.id} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
