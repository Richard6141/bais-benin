"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VERIFICATION_LABELS, VERIFICATION_STATUSES } from "./dashboard-logic";

const ALL = "__all__";

interface DashboardFiltersBarProps {
  campaigns: readonly { code: string }[];
  crops: readonly { code: string; nameFr: string }[];
  departements: readonly { code: string; name: string }[];
  /** Campagne affichée quand l'adresse n'en précise pas (l'ouverte, sinon la dernière close). */
  defaultCampaignCode?: string;
  /** Filtres proposés : la fiche commune n'a pas de filtre de département. */
  fields?: ReadonlyArray<"campaignCode" | "cropCode" | "departementCode" | "verificationStatus">;
}

// Filtres du tableau de bord, dans l'adresse (mêmes clés que la carte agricole) : une vue filtrée
// se partage par lien, s'imprime et se retrouve au rechargement.
export function DashboardFiltersBar({
  campaigns,
  crops,
  departements,
  defaultCampaignCode,
  fields = ["campaignCode", "cropCode", "departementCode", "verificationStatus"],
}: DashboardFiltersBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === ALL || (key === "campaignCode" && value === defaultCampaignCode))
      next.delete(key);
    else next.set(key, value);
    const query = next.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}` as Route, { scroll: false });
  }

  const definitions = {
    campaignCode: {
      label: "Campagne",
      all: null,
      options: campaigns.map((c) => ({ code: c.code, label: c.code })),
    },
    cropCode: {
      label: "Culture",
      all: "Toutes les cultures",
      options: crops.map((c) => ({ code: c.code, label: c.nameFr })),
    },
    departementCode: {
      label: "Département",
      all: "Tout le pays",
      options: departements.map((d) => ({ code: d.code, label: d.name })),
    },
    verificationStatus: {
      label: "Vérification",
      all: "Toutes",
      options: VERIFICATION_STATUSES.map((code) => ({ code, label: VERIFICATION_LABELS[code] })),
    },
  } as const;

  return (
    <div
      role="search"
      aria-label="Filtrer le tableau de bord"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:hidden"
    >
      {fields.map((key) => {
        const field = definitions[key];
        const current =
          params.get(key) ?? (key === "campaignCode" ? (defaultCampaignCode ?? ALL) : ALL);
        return (
          <div key={key} className="flex flex-col gap-1.5">
            <Label htmlFor={`tableau-${key}`}>{field.label}</Label>
            <Select value={current} onValueChange={(value) => update(key, value)}>
              <SelectTrigger id={`tableau-${key}`} className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {field.all ? <SelectItem value={ALL}>{field.all}</SelectItem> : null}
                {field.options.map((option) => (
                  <SelectItem key={option.code} value={option.code}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}
