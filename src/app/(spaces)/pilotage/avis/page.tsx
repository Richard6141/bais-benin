import { Download } from "lucide-react";
import type { Metadata } from "next";
import { HelpTip } from "@/components/forms/help-tip";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { requireRole } from "@/features/auth/session";
import { FeedbackList } from "@/features/feedback/feedback-list";
import {
  FEEDBACK_KINDS,
  FEEDBACK_ROLES,
  FEEDBACK_STATUSES,
  KIND_LABELS,
  ROLE_LABELS,
  STATUS_LABELS,
  listFeedback,
  parseFeedbackFilters,
} from "@/modules/feedback";

export const metadata: Metadata = { title: "Avis des testeurs" };

const count = new Intl.NumberFormat("fr-FR");

function FilterSelect({
  id,
  label,
  value,
  options,
}: {
  id: string;
  label: string;
  value: string | undefined;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`filtre-${id}`}>{label}</Label>
      <select
        id={`filtre-${id}`}
        name={id}
        defaultValue={value ?? ""}
        className="h-11 rounded-md border bg-background px-3 text-base"
      >
        <option value="">Tous</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// Avis des testeurs (chantier J) : ce que les équipes du ministère et les agriculteurs disent de
// la démonstration, dans l'application même. Ministère seulement ; l'auteur n'est jamais montré.
export default async function FeedbackPage(props: PageProps<"/pilotage/avis">) {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/avis" });
  const params = (await props.searchParams) as Record<string, string | string[] | undefined>;
  const filters = parseFeedbackFilters(params);
  const rows = await listFeedback(user.actor, filters);
  const search = new URLSearchParams();
  if (filters.kind) search.set("type", filters.kind);
  if (filters.role) search.set("role", filters.role);
  if (filters.status) search.set("statut", filters.status);
  const query = search.toString();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Centre de pilotage"
        title="Avis des testeurs"
        description={`${count.format(rows.length)} avis, du plus récent au plus ancien. Seul le rôle de l'auteur est montré.`}
        actions={
          <Button asChild variant="outline" className="h-11">
            <a href={`/api/v1/feedback/export.csv${query ? `?${query}` : ""}`} download>
              <Download aria-hidden />
              Exporter en CSV
            </a>
          </Button>
        }
      />
      <form method="get" className="flex flex-wrap items-end gap-3">
        <FilterSelect
          id="type"
          label="Type"
          value={filters.kind}
          options={FEEDBACK_KINDS.map((value) => ({ value, label: KIND_LABELS[value] }))}
        />
        <FilterSelect
          id="role"
          label="Rôle"
          value={filters.role}
          options={FEEDBACK_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }))}
        />
        <FilterSelect
          id="statut"
          label="État"
          value={filters.status}
          options={FEEDBACK_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }))}
        />
        <Button type="submit" className="h-11">
          Filtrer
        </Button>
        <HelpTip label="Avis des testeurs">
          Chaque avis porte la page, le rôle, la date et le type d&apos;écran de son auteur. Les
          numéros de téléphone et NPI écrits dans le message sont masqués. Passer un avis à « Vu »
          ou « Traité » est inscrit au journal d&apos;audit. Rien n&apos;est envoyé hors de
          l&apos;application.
        </HelpTip>
      </form>
      <FeedbackList rows={rows} />
      {/* Lien de retour sans filtre, quand un filtre est actif. */}
      {query ? (
        <Button asChild variant="link" className="self-start px-0">
          <a href="/pilotage/avis">Voir tous les avis</a>
        </Button>
      ) : null}
    </div>
  );
}
