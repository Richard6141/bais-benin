"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type HarvestUnit = "KG" | "T" | "BAG_100KG" | "BAG_50KG" | "BUNCH" | "HEAP" | "BASIN";

export interface UnitOption<TUnit extends string = HarvestUnit> {
  code: TUnit;
  label: string;
  /** Facteur vers l'unité de référence (kg par défaut) ; null quand il n'est pas normalisé. */
  kgFactor: number | null;
}

export type HarvestUnitOption = UnitOption<HarvestUnit>;

// Les unités locales (régime, tas, bassine) n'ont pas de poids fixe : leur facteur reste null tant
// qu'une enquête ATDA n'a pas fourni une valeur par commune (docs/08 §4, notes de modélisation).
export const HARVEST_UNITS: readonly HarvestUnitOption[] = [
  { code: "KG", label: "kilogramme", kgFactor: 1 },
  { code: "T", label: "tonne", kgFactor: 1000 },
  { code: "BAG_100KG", label: "sac de 100 kg", kgFactor: 100 },
  { code: "BAG_50KG", label: "sac de 50 kg", kgFactor: 50 },
  { code: "BUNCH", label: "régime", kgFactor: null },
  { code: "HEAP", label: "tas", kgFactor: null },
  { code: "BASIN", label: "bassine", kgFactor: null },
];

export interface UnitAmountValue<TUnit extends string = HarvestUnit> {
  amount: string;
  unit: TUnit;
}

interface UnitAmountFieldProps<TUnit extends string> {
  id: string;
  label: string;
  value: UnitAmountValue<TUnit>;
  onChange: (value: UnitAmountValue<TUnit>) => void;
  units?: readonly UnitOption<TUnit>[];
  /** Unité de référence affichée dans l'équivalent ; « kg » pour les récoltes, « ha » pour les surfaces. */
  referenceUnit?: string;
  /** Masque l'équivalent quand l'unité saisie est déjà l'unité de référence. */
  showEquivalent?: boolean;
  error?: string;
  className?: string;
}

/** Convertit une saisie française (« 12,5 ») en nombre ; NaN si la saisie n'est pas un nombre. */
export function parseAmount(amount: string): number {
  const normalized = amount.trim().replace(/\s/g, "").replace(",", ".");
  if (normalized === "" || !/^\d*\.?\d*$/.test(normalized)) return Number.NaN;
  return Number.parseFloat(normalized);
}

const amountFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** Texte de l'équivalent dans l'unité de référence, ou null si le facteur est inconnu ou la saisie vide. */
export function describeKgEquivalent<TUnit extends string>(
  value: UnitAmountValue<TUnit>,
  units: readonly UnitOption<TUnit>[],
  referenceUnit = "kg",
) {
  const unit = units.find((option) => option.code === value.unit);
  const amount = parseAmount(value.amount);
  if (!unit || Number.isNaN(amount)) return null;
  if (unit.kgFactor === null) return `équivalent ${referenceUnit} non normalisé`;
  return `≈ ${amountFormatter.format(amount * unit.kgFactor)} ${referenceUnit}`;
}

// Quantité dans l'unité du producteur : le chiffre est saisi tel qu'il est compté sur le terrain,
// la conversion vers l'unité de référence est affichée pour information, jamais exigée.
export function UnitAmountField<TUnit extends string = HarvestUnit>({
  id,
  label,
  value,
  onChange,
  units = HARVEST_UNITS as unknown as readonly UnitOption<TUnit>[],
  referenceUnit = "kg",
  showEquivalent = true,
  error,
  className,
}: UnitAmountFieldProps<TUnit>) {
  const equivalent = showEquivalent ? describeKgEquivalent(value, units, referenceUnit) : null;
  const hintId = `${id}-equivalent`;
  const errorId = `${id}-error`;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          className="tabular min-w-0 flex-1 text-base"
          value={value.amount}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          // Seuls les chiffres et un séparateur décimal (virgule ou point) sont conservés.
          onChange={(event) =>
            onChange({ ...value, amount: event.target.value.replace(/[^\d.,]/g, "") })
          }
        />
        <Select
          value={value.unit}
          onValueChange={(unit) => onChange({ ...value, unit: unit as TUnit })}
        >
          <SelectTrigger id={`${id}-unit`} aria-label="Unité" className="w-44 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {units.map((option) => (
              <SelectItem key={option.code} value={option.code}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p id={hintId} className="tabular min-h-5 text-sm text-muted-foreground">
        {equivalent ?? " "}
      </p>
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
