import type { Metadata } from "next";
import { StatTile } from "@/components/data-display/stat-tile";
import { HelpTip } from "@/components/forms/help-tip";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { AgentCreateForm } from "@/features/agents/agent-create-form";
import { AgentList } from "@/features/agents/agent-list";
import { requireRole } from "@/features/auth/session";
import { listAgents } from "@/modules/identity";

export const metadata: Metadata = { title: "Agents de terrain" };

const date = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeZone: "Africa/Porto-Novo",
});

// Agents de terrain (ADR-0013) : le ministère ouvre leurs comptes, choisit leurs communes, les
// réaffecte et leur retire l'accès depuis le pilotage, sans script. Chaque geste passe par le
// journal d'audit. Ministère seulement.
export default async function AgentsPage() {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/agents" });
  const result = await listAgents(user.actor);
  if (!result.ok) throw new Error("Accès refusé à la gestion des agents");
  const { agents, revoked, territories, communeCount, uncovered } = result;
  const farms = agents.reduce((sum, agent) => sum + agent.farmsRegistered, 0);

  // Communes sans agent, groupées par département pour se lire d'un coup d'œil.
  const uncoveredByDepartement = new Map<string, string[]>();
  for (const commune of uncovered) {
    const list = uncoveredByDepartement.get(commune.departementName) ?? [];
    list.push(commune.name);
    uncoveredByDepartement.set(commune.departementName, list);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Centre de pilotage"
        title="Agents de terrain"
        description="Qui enregistre les exploitations, et dans quelles communes."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Agents actifs" value={agents.length} />
        <StatTile
          label="Communes couvertes"
          value={communeCount - uncovered.length}
          unit={`sur ${communeCount}`}
        />
        <StatTile label="Exploitations enregistrées" value={farms} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
        <section aria-labelledby="agents-actifs" className="flex flex-col gap-3">
          <div className="flex items-center gap-1.5">
            <h2 id="agents-actifs" className="text-lg font-bold">
              Agents actifs
            </h2>
            <HelpTip label="Agents actifs">
              Un agent voit et enregistre les exploitations de son périmètre. Changer ce périmètre
              met à jour son téléphone dès sa prochaine connexion au réseau. Chaque ouverture,
              changement ou retrait est inscrit au journal d&apos;audit avec votre compte.
            </HelpTip>
          </div>
          <AgentList agents={agents} territories={territories} />
        </section>

        <aside className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4 p-4">
            <div className="flex items-center gap-1.5">
              <h2 className="text-lg font-bold">Ouvrir un compte d&apos;agent</h2>
              <HelpTip label="Ouvrir un compte d'agent">
                Un compte déjà ouvert avec ce NPI et ce numéro reçoit l&apos;accès d&apos;agent :
                c&apos;est aussi la façon de rendre l&apos;accès à un agent retiré.
              </HelpTip>
            </div>
            <AgentCreateForm territories={territories} />
          </Card>

          <Card className="flex flex-col gap-3 p-4">
            <h2 className="text-lg font-bold">
              Communes sans agent{" "}
              <span className="tabular font-normal text-muted-foreground">
                ({uncovered.length})
              </span>
            </h2>
            {uncovered.length === 0 ? (
              <p className="text-sm text-muted-foreground">Toutes les communes ont un agent.</p>
            ) : (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-primary">
                  Voir les communes
                </summary>
                <dl className="mt-3 flex flex-col gap-2">
                  {[...uncoveredByDepartement].map(([departement, names]) => (
                    <div key={departement}>
                      <dt className="font-semibold">{departement}</dt>
                      <dd className="text-muted-foreground">{names.join(", ")}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
          </Card>

          {revoked.length > 0 ? (
            <Card className="flex flex-col gap-3 p-4">
              <h2 className="text-lg font-bold">Accès retirés</h2>
              <ul className="flex flex-col gap-2 text-sm">
                {revoked.map((row) => (
                  <li key={row.userId} className="flex flex-wrap justify-between gap-x-3">
                    <span className="font-medium">{row.name}</span>
                    <span className="text-muted-foreground">le {date.format(row.revokedAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
