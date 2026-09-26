import type { Route } from "next";
import Link from "next/link";
import { HelpTip } from "@/components/forms/help-tip";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  ProducerGroupFigures,
  ProducerGroupMemberRow,
  ProducerGroupMessageItem,
  ProducerGroupSummary,
} from "@/modules/producer-groups";

const tonnes = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const yields = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });

export const shortDate = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Africa/Porto-Novo",
});

const dateTime = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Africa/Porto-Novo",
});

// ---------------------------------------------------------------------------
// Liste des groupes
// ---------------------------------------------------------------------------

export function GroupsTable({ rows, caption }: { rows: ProducerGroupSummary[]; caption: string }) {
  return (
    <div className="overflow-x-auto rounded-sm border">
      <Table>
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          <TableRow>
            <TableHead>Nom du groupe</TableHead>
            <TableHead>Culture</TableHead>
            <TableHead>Zone</TableHead>
            <TableHead>Campagne</TableHead>
            <TableHead className="text-right">Membres</TableHead>
            <TableHead>Formé le</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="max-w-sm whitespace-normal">
                <Link
                  href={`/pilotage/groupes/${row.id}` as Route}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {row.name}
                </Link>
              </TableCell>
              <TableCell>{row.cropName}</TableCell>
              <TableCell>{row.departementName ?? "Tout le Bénin"}</TableCell>
              <TableCell className="tabular">{row.campaignCode}</TableCell>
              <TableCell className="tabular text-right">{row.members}</TableCell>
              <TableCell className="whitespace-nowrap">
                {shortDate.format(row.createdAt)}
                <span className="block text-xs text-muted-foreground">{row.createdByName}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chiffres du groupe
// ---------------------------------------------------------------------------

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 bg-card p-4">
      <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="tabular text-2xl font-semibold tracking-tight">{value}</dd>
      {note ? <dd className="text-xs text-muted-foreground">{note}</dd> : null}
    </div>
  );
}

export function GroupFigures({ figures }: { figures: ProducerGroupFigures }) {
  const share = figures.members > 0 ? figures.consented / figures.members : 0;
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border bg-border lg:grid-cols-4">
      <Figure label="Membres" value={String(figures.members)} />
      <Figure label="Production totale" value={`${tonnes.format(figures.productionT)} t`} />
      <Figure
        label="Rendement moyen"
        value={
          figures.meanYieldTPerHa === null
            ? "Non calculé"
            : `${yields.format(figures.meanYieldTPerHa)} t/ha`
        }
        note="Production totale sur surface totale"
      />
      <Figure
        label="Accord WhatsApp"
        value={percent.format(share)}
        note={`${figures.consented} sur ${figures.members}`}
      />
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Membres
// ---------------------------------------------------------------------------

export function GroupMembersTable({
  members,
  byYield,
}: {
  members: ProducerGroupMemberRow[];
  /** Groupe formé au rendement : la colonne rendement est mise en avant. */
  byYield: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-sm border">
      <Table>
        <caption className="sr-only">Membres du groupe, dans l&apos;ordre du classement</caption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14 text-right">Rang</TableHead>
            <TableHead>Producteur</TableHead>
            <TableHead>Commune</TableHead>
            <TableHead className={byYield ? "text-right font-bold" : "text-right"}>
              Rendement (t/ha)
            </TableHead>
            <TableHead className={byYield ? "text-right" : "text-right font-bold"}>
              Production (t)
            </TableHead>
            <TableHead>Vérification</TableHead>
            <TableHead>WhatsApp</TableHead>
            <TableHead>
              <span className="sr-only">Champ sur la carte</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((row) => (
            <TableRow key={row.farmerId}>
              <TableCell className="tabular text-right font-bold">{row.rank}</TableCell>
              <TableCell>
                <span className="block font-medium">{row.farmerName}</span>
                <span className="block font-mono text-xs text-muted-foreground">
                  {row.farmerCode}
                </span>
              </TableCell>
              <TableCell>
                <span className="block">{row.communeName}</span>
                <span className="block text-xs text-muted-foreground">{row.departementName}</span>
              </TableCell>
              <TableCell className="tabular text-right">
                {row.yieldTPerHa === null ? (
                  <span className="text-xs text-muted-foreground">Non calculé</span>
                ) : (
                  yields.format(row.yieldTPerHa)
                )}
              </TableCell>
              <TableCell className="tabular text-right">{tonnes.format(row.productionT)}</TableCell>
              <TableCell>
                <Badge variant={row.verified ? "success" : "outline"}>
                  {row.verified ? "Vérifiée" : "Déclarée"}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">
                {row.whatsappConsent ? "Oui" : <span className="text-muted-foreground">Non</span>}
              </TableCell>
              <TableCell className="text-sm whitespace-nowrap">
                {row.parcelId ? (
                  <Link
                    href={`/carte?parcelle=${row.parcelId}` as Route}
                    className="underline underline-offset-4"
                  >
                    Voir le champ
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Aucune parcelle</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Messages envoyés
// ---------------------------------------------------------------------------

export function GroupMessages({ messages }: { messages: ProducerGroupMessageItem[] }) {
  return (
    <section aria-labelledby="messages-envoyes" className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <h2 id="messages-envoyes" className="text-lg font-semibold">
          Messages envoyés
        </h2>
        <HelpTip label="Messages envoyés">
          Non envoyé : fiche de démonstration, accord retiré depuis, numéro absent ou refusé par
          l&apos;opérateur. En attente : prochaine vague d&apos;envoi, ou silence de nuit.
        </HelpTip>
      </div>
      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun message pour l&apos;instant.</p>
      ) : (
        <ul className="divide-y rounded-sm border">
          {messages.map((message) => (
            <li key={message.id} className="flex flex-col gap-1.5 p-4 text-sm">
              <span className="text-muted-foreground">
                {dateTime.format(message.createdAt)}, par {message.sentByName}
              </span>
              <p className="whitespace-pre-line">{message.text}</p>
              <span className="tabular text-muted-foreground">
                {message.recipients} destinataire{message.recipients > 1 ? "s" : ""} : envoyés{" "}
                {message.sent}, en attente {message.pending}, non envoyés {message.notSent}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
