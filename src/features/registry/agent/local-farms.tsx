"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CloudUpload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getAgentDatabase } from "@/lib/offline/db";
import { formatHa } from "./labels";

// Exploitations enregistrées sur cet appareil et pas encore parties au serveur : elles passent en
// tête, dans le même format compact que la liste, avec leur pastille, sans attendre le réseau.
export function LocalFarms({ userId }: { userId: string }) {
  const db = getAgentDatabase(userId);
  const farms = useLiveQuery(
    () => db.farms.where("syncState").equals("LOCAL_ONLY").reverse().sortBy("updatedAt"),
    [db],
    [],
  );
  if (farms.length === 0) return null;
  return (
    <section aria-labelledby="local-farms-title" className="flex flex-col gap-2">
      <h2 id="local-farms-title" className="text-sm font-semibold text-muted-foreground">
        Enregistrées sur cet appareil
      </h2>
      <ul className="flex flex-col divide-y rounded-lg border border-dashed bg-card">
        {farms.map((farm) => (
          <li key={farm.id} className="flex flex-col gap-0.5 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold break-words">{farm.farmerName}</span>
              <Badge variant="info">
                <CloudUpload aria-hidden />À synchroniser
              </Badge>
            </div>
            <p className="text-sm break-words text-muted-foreground">
              <span className="font-mono text-xs">{farm.code}</span>, {farm.communeName}
            </p>
            <p className="tabular text-sm text-muted-foreground">
              {farm.parcelCount} parcelle{farm.parcelCount > 1 ? "s" : ""},{" "}
              {formatHa(farm.declaredAreaHa)} déclarés
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
