import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { AgentRow, TerritoryOption } from "@/modules/identity/agents";
import { AgentRowActions } from "./agent-row-actions";

const date = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeZone: "Africa/Porto-Novo",
});
const count = new Intl.NumberFormat("fr-FR");

// Agents actifs vus du ministère : qui, joignable où, sur quel périmètre, avec quel travail
// déjà fait, et les gestes pour le réaffecter ou lui retirer l'accès.
export function AgentList({
  agents,
  territories,
}: {
  agents: readonly AgentRow[];
  territories: readonly TerritoryOption[];
}) {
  if (agents.length === 0) {
    return (
      <EmptyState
        title="Aucun agent actif"
        description="Ouvrez le compte d'un agent avec son NPI, son numéro et ses communes."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {agents.map((agent) => (
        <li key={agent.userId}>
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">{agent.name}</h3>
              {agent.demo ? <Badge variant="info">Démonstration</Badge> : null}
              <span className="ml-auto text-sm text-muted-foreground">
                Depuis le {date.format(agent.since)}
              </span>
            </div>
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Téléphone</dt>
                <dd className="tabular">{agent.phone ? `+229 ${agent.phone}` : "Non renseigné"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">NPI</dt>
                <dd className="tabular">{agent.npi ?? "Non relié"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Exploitations enregistrées</dt>
                <dd className="tabular font-semibold">{count.format(agent.farmsRegistered)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Dernière connexion</dt>
                <dd>{agent.lastLoginAt ? date.format(agent.lastLoginAt) : "Jamais"}</dd>
              </div>
            </dl>
            <ul className="flex flex-wrap gap-2" aria-label={`Périmètre de ${agent.name}`}>
              {agent.scopes.map((scope) => (
                <li key={`${scope.scopeType}-${scope.scopeId}`}>
                  <Badge variant={scope.scopeType === "DEPARTEMENT" ? "success" : "secondary"}>
                    {scope.label}
                  </Badge>
                </li>
              ))}
            </ul>
            <AgentRowActions
              userId={agent.userId}
              name={agent.name}
              scopes={agent.scopes}
              territories={territories}
            />
          </Card>
        </li>
      ))}
    </ul>
  );
}
