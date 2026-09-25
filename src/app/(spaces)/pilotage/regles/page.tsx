import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORY_LABELS } from "@/components/data-display/alert-labels";
import { SeverityBadge } from "@/components/data-display/severity-badge";
import { SourceCaption } from "@/components/data-display/source-caption";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireRole } from "@/features/auth/session";
import { RuleToggle } from "@/features/monitoring/rules-admin/rule-toggle";
import { listRules } from "@/modules/monitoring/rule-admin";

export const metadata: Metadata = { title: "Règles d'alerte" };

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Porto-Novo",
});

// Gouvernance des règles d'alerte (monitoring-parcours-ux §2.C4) : liste, activation.
// requireRole impose le rôle ministère (compte identifié par NPI, ADR-0012).
export default async function RulesPage() {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/regles" });
  const rules = await listRules(user.actor);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Centre de pilotage"
        title="Règles d'alerte"
        description="Chaque alerte provient d'une de ces règles. Toute modification crée une nouvelle version, l'ancienne reste consultable."
        actions={
          <Button asChild variant="outline">
            <Link href="/pilotage/alertes">Centre d&apos;alertes</Link>
          </Button>
        }
      />
      <Table>
        <TableCaption>
          Règles actives et désactivées. Déclenchements : alertes levées ces 30 derniers jours.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Règle</TableHead>
            <TableHead scope="col">Sévérité</TableHead>
            <TableHead scope="col">Catégorie</TableHead>
            <TableHead scope="col" className="text-right">
              Version
            </TableHead>
            <TableHead scope="col" className="text-right">
              Déclenchements
            </TableHead>
            <TableHead scope="col">Dernière évaluation</TableHead>
            <TableHead scope="col">Active</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((rule) => (
            <TableRow key={rule.code}>
              <TableCell className="whitespace-normal">
                <Link
                  href={`/pilotage/regles/${rule.code}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {rule.name}
                </Link>
                <span className="block font-mono text-xs text-muted-foreground">{rule.code}</span>
              </TableCell>
              <TableCell>
                <SeverityBadge
                  severity={rule.severity as "INFO" | "WATCH" | "WARNING" | "CRITICAL"}
                />
              </TableCell>
              <TableCell>
                {CATEGORY_LABELS[rule.category as keyof typeof CATEGORY_LABELS]?.label ??
                  rule.category}
              </TableCell>
              <TableCell className="tabular text-right">{rule.version}</TableCell>
              <TableCell className="tabular text-right">{rule.alertsLast30Days}</TableCell>
              <TableCell>
                {rule.lastEvaluatedAt ? dateFormatter.format(rule.lastEvaluatedAt) : "jamais"}
              </TableCell>
              <TableCell>
                <RuleToggle
                  code={rule.code}
                  name={rule.name}
                  enabled={rule.enabled}
                  critical={rule.severity === "CRITICAL"}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <SourceCaption source="Règles versionnées de la plateforme ; seuils indicatifs à valider avec l'ATDA" />
    </div>
  );
}
