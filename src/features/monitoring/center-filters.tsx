"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CATEGORY_LABELS } from "@/components/data-display/alert-labels";
import { SEVERITY_LABELS } from "@/components/data-display/severity-badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIES, SEVERITIES } from "./monitoring-logic";

const ALL = "__all__";

interface CenterFiltersProps {
  departements: readonly { code: string; name: string }[];
}

// Filtres du centre d'alertes, reflétés dans l'adresse : une vue filtrée se partage par lien.
export function CenterFilters({ departements }: CenterFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === ALL) next.delete(key);
    else next.set(key, value);
    next.delete("commune");
    const query = next.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}` as Route, { scroll: false });
  }

  const fields = [
    {
      key: "severite",
      label: "Sévérité",
      options: SEVERITIES.map((code) => ({ code, label: SEVERITY_LABELS[code] })),
    },
    {
      key: "categorie",
      label: "Catégorie",
      options: CATEGORIES.map((code) => ({ code, label: CATEGORY_LABELS[code].label })),
    },
    {
      key: "departement",
      label: "Département",
      options: departements.map((d) => ({ code: d.code, label: d.name })),
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3" role="search" aria-label="Filtrer les alertes">
      {fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1.5">
          <Label htmlFor={`filtre-${field.key}`}>{field.label}</Label>
          <Select
            value={params.get(field.key) ?? ALL}
            onValueChange={(value) => update(field.key, value)}
          >
            <SelectTrigger id={`filtre-${field.key}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Toutes</SelectItem>
              {field.options.map((option) => (
                <SelectItem key={option.code} value={option.code}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}
