"use client";

import { X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { TerritoryOption } from "@/modules/identity/agents";

interface ScopePickerProps {
  territories: readonly TerritoryOption[];
  initialCommuneIds?: readonly string[];
  initialDepartementIds?: readonly string[];
}

interface Chosen {
  id: string;
  label: string;
  kind: "commune" | "departement";
}

// Choix du périmètre d'un agent : un département à la fois pour garder la liste courte, ses
// communes à cocher, ou le département entier. Ce qui est coché ailleurs reste choisi et se voit
// dans le récapitulatif. Le formulaire reçoit des champs « commune » et « departement ».
export function ScopePicker({
  territories,
  initialCommuneIds = [],
  initialDepartementIds = [],
}: ScopePickerProps) {
  const id = useId();
  const [communes, setCommunes] = useState<ReadonlySet<string>>(() => new Set(initialCommuneIds));
  const [departements, setDepartements] = useState<ReadonlySet<string>>(
    () => new Set(initialDepartementIds),
  );
  const [current, setCurrent] = useState(() => {
    const first =
      initialDepartementIds[0] ??
      territories.find((d) => d.communes.some((c) => initialCommuneIds.includes(c.id)))?.id;
    return first ?? territories[0]?.id ?? "";
  });

  const departement = territories.find((d) => d.id === current);
  const wholeDepartement = departement ? departements.has(departement.id) : false;

  const chosen = useMemo<Chosen[]>(() => {
    const list: Chosen[] = [];
    for (const d of territories) {
      if (departements.has(d.id)) {
        list.push({ id: d.id, label: `Département ${d.name}`, kind: "departement" });
        continue;
      }
      for (const c of d.communes) {
        if (communes.has(c.id)) list.push({ id: c.id, label: c.name, kind: "commune" });
      }
    }
    return list;
  }, [territories, communes, departements]);

  function toggle(set: ReadonlySet<string>, value: string, on: boolean): Set<string> {
    const next = new Set(set);
    if (on) next.add(value);
    else next.delete(value);
    return next;
  }

  function remove(item: Chosen) {
    if (item.kind === "departement") setDepartements((s) => toggle(s, item.id, false));
    else setCommunes((s) => toggle(s, item.id, false));
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium">Périmètre</legend>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-departement`}>Département</Label>
        <select
          id={`${id}-departement`}
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          className="h-11 rounded-md border bg-background px-3 text-base"
        >
          {territories.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {departement ? (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
            <Checkbox
              checked={wholeDepartement}
              onCheckedChange={(value) =>
                setDepartements((s) => toggle(s, departement.id, value === true))
              }
            />
            Tout le département
          </label>
          <ul className="grid gap-x-4 sm:grid-cols-2">
            {departement.communes.map((c) => (
              <li key={c.id}>
                <label className="flex min-h-10 items-center gap-3 text-sm">
                  <Checkbox
                    checked={wholeDepartement || communes.has(c.id)}
                    disabled={wholeDepartement}
                    onCheckedChange={(value) => setCommunes((s) => toggle(s, c.id, value === true))}
                  />
                  {c.name}
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5" aria-live="polite">
        <p className="text-sm text-muted-foreground">
          {chosen.length === 0 ? "Aucun territoire choisi" : "Territoires choisis"}
        </p>
        {chosen.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {chosen.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <span className="inline-flex h-8 items-center gap-1 rounded-sm bg-secondary pr-1 pl-2.5 text-sm font-medium">
                  {item.label}
                  <button
                    type="button"
                    onClick={() => remove(item)}
                    aria-label={`Retirer ${item.label}`}
                    className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {chosen.map((item) => (
        <input
          key={`${item.kind}-${item.id}`}
          type="hidden"
          name={item.kind === "departement" ? "departement" : "commune"}
          value={item.id}
        />
      ))}
    </fieldset>
  );
}
