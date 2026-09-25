import { Bug, Droplets, FileText, Store, SunMedium, Waves, type LucideIcon } from "lucide-react";

// Libellés et formats des alertes, sans directive client : les pages serveur les importent
// directement (un export d'un module « use client » n'y serait qu'une référence client).

export type AlertCategory = "WATER_STRESS" | "FLOOD" | "HEAT" | "PEST" | "MARKET" | "ADMIN";

export const CATEGORY_LABELS: Record<AlertCategory, { label: string; Icon: LucideIcon }> = {
  WATER_STRESS: { label: "Stress hydrique", Icon: Droplets },
  FLOOD: { label: "Excès d'eau", Icon: Waves },
  HEAT: { label: "Chaleur", Icon: SunMedium },
  PEST: { label: "Ravageurs", Icon: Bug },
  MARKET: { label: "Marché", Icon: Store },
  ADMIN: { label: "Administration", Icon: FileText },
};

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

export function formatPeriod(startsOn: string, endsOn?: string | null): string {
  const start = dateFormatter.format(new Date(startsOn));
  return endsOn ? `Du ${start} au ${dateFormatter.format(new Date(endsOn))}` : `Depuis le ${start}`;
}
