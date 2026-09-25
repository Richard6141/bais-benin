"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CampaignSelectProps {
  campaigns: ReadonlyArray<{ code: string; status: "PLANNED" | "OPEN" | "CLOSED" }>;
  value: string;
}

const statusLabel: Record<CampaignSelectProps["campaigns"][number]["status"], string> = {
  OPEN: "en cours",
  CLOSED: "close",
  PLANNED: "à venir",
};

// Sélecteur de campagne de l'historique agriculteur : un seul contrôle, pleine largeur, qui
// recharge la page avec la campagne choisie (pas d'onglets sur l'espace agriculteur).
export function CampaignSelect({ campaigns, value }: CampaignSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="campagne" className="text-base">
        Campagne
      </Label>
      <Select
        value={value}
        onValueChange={(code) => router.push(`${pathname}?campagne=${code}` as Route)}
      >
        <SelectTrigger id="campagne" className="h-14 w-full text-base">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {campaigns.map((campaign) => (
            <SelectItem key={campaign.code} value={campaign.code} className="text-base">
              {campaign.code} ({statusLabel[campaign.status]})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
