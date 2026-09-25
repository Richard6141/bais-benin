"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AgentAlertTabsProps {
  activeCount: number;
  recentCount: number;
  unreadActive: number;
  active: ReactNode;
  recent: ReactNode;
}

// B1 : deux onglets, « Actives » par défaut. Les listes sont rendues côté serveur et passées en
// contenu ; seul le changement d'onglet est client.
export function AgentAlertTabs({
  activeCount,
  recentCount,
  unreadActive,
  active,
  recent,
}: AgentAlertTabsProps) {
  return (
    <Tabs defaultValue="actives">
      <TabsList className="h-11 w-full sm:w-auto">
        <TabsTrigger value="actives" className="min-h-10 gap-2">
          Actives
          <span className="tabular text-xs text-muted-foreground">{activeCount}</span>
          {unreadActive > 0 ? (
            <Badge variant="warning" className="px-1.5">
              {unreadActive} non lue{unreadActive > 1 ? "s" : ""}
            </Badge>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="recentes" className="min-h-10 gap-2">
          Récentes
          <span className="tabular text-xs text-muted-foreground">{recentCount}</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="actives" className="pt-4">
        {active}
      </TabsContent>
      <TabsContent value="recentes" className="pt-4">
        {recent}
      </TabsContent>
    </Tabs>
  );
}
