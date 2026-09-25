import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CATEGORY_LABELS } from "@/components/data-display/alert-labels";
import { SeverityBadge } from "@/components/data-display/severity-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireRole } from "@/features/auth/session";
import { RuleDefinitionEditor } from "@/features/monitoring/rules-admin/rule-definition-editor";
import { addDays, beninToday } from "@/modules/monitoring";
import { RuleAdminError, getRuleHistory, listThresholds } from "@/modules/monitoring/rule-admin";
import { explainDefinition } from "@/modules/monitoring/rule-admin/thresholds";
import { parseRuleDefinition } from "@/modules/monitoring/rules";
import { listCommunes } from "@/modules/territory";

export const metadata: Metadata = { title: "Règle d'alerte" };

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Porto-Novo",
});

const ACTION_LABELS: Record<string, string> = {
  "rule.toggled": "Activation ou désactivation",
  "rule.updated": "Nouvelle version",
  "rule.simulated": "Simulation",
  "rule.created": "Création",
};

// Fiche d'une règle (§2.C5, C6) : définition lisible, éditeur des seuils, simulation, versions
// et journal des actions.
export default async function RulePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await requireRole("ADMIN_STATE", { returnTo: `/pilotage/regles/${code}` });
  let history;
  try {
    history = await getRuleHistory(user.actor, code);
  } catch (error) {
    if (error instanceof RuleAdminError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const { current } = history;
  const definition = parseRuleDefinition(current.definition);
  const communes = await listCommunes();
  const previewCommune = communes.reduce(
    (longest, c) => (c.name.length > longest.length ? c.name : longest),
    "Djougou",
  );
  const today = beninToday(new Date());

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`Règle ${current.code} · version ${current.version}`}
        title={current.name}
        description={current.description}
        actions={
          <Button asChild variant="outline">
            <Link href="/pilotage/regles">Toutes les règles</Link>
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={current.severity} />
        <Badge variant="outline">
          {CATEGORY_LABELS[current.category as keyof typeof CATEGORY_LABELS]?.label ??
            current.category}
        </Badge>
        <Badge variant={current.enabled ? "success" : "offline"}>
          {current.enabled ? "Active" : "Désactivée"}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Modifier les seuils et les messages</CardTitle>
            <CardDescription>
              Chaque enregistrement crée la version {current.version + 1} et désactive la version{" "}
              {current.version}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RuleDefinitionEditor
              rule={{
                code: current.code,
                version: current.version,
                definition,
                thresholds: listThresholds(definition),
                messageShort: current.messageShort,
                adviceFr: current.adviceFr,
                cooldownHours: current.cooldownHours,
              }}
              previewCommune={previewCommune}
              simulationFrom={addDays(today, -30)}
              simulationTo={addDays(today, -1)}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Conditions actuelles</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                {explainDefinition(definition).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="mt-3 text-sm">
                <span className="font-medium">Conseil : </span>
                {current.adviceFr}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Versions</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Version</TableHead>
                    <TableHead scope="col">Créée le</TableHead>
                    <TableHead scope="col">Par</TableHead>
                    <TableHead scope="col">État</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.versions.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="tabular">{v.version}</TableCell>
                      <TableCell>{dateFormatter.format(v.createdAt)}</TableCell>
                      <TableCell>{v.createdByName ?? "Catalogue initial"}</TableCell>
                      <TableCell>{v.enabled ? "Active" : "Archivée"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Journal</CardTitle>
            </CardHeader>
            <CardContent>
              {history.journal.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune action enregistrée.</p>
              ) : (
                <ol className="flex flex-col divide-y text-sm">
                  {history.journal.map((entry, index) => (
                    <li
                      key={`${entry.action}-${index}`}
                      className="flex justify-between gap-3 py-2"
                    >
                      <span>
                        {ACTION_LABELS[entry.action] ?? entry.action}
                        {entry.actorName ? `, ${entry.actorName}` : ""}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {dateFormatter.format(entry.occurredAt)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
