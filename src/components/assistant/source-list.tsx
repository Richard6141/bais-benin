import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface SourceItem {
  slug: string;
  title: string;
  organization: string;
  sourceTitle: string;
  url: string;
  licence: string;
  demonstration: boolean;
  /** Date de vérification de l'adresse et de la licence (AAAA-MM-JJ). */
  checkedOn: string;
  /** Extraits cités, recopiés mot pour mot de la fiche. */
  quotes: readonly string[];
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" });

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? iso : dateFormat.format(date);
}

// Sources dépliables d'une réponse : fiche, organisme, document d'origine, licence, date de
// vérification et extraits cités. Repliées par défaut : la réponse courte d'abord.
export function SourceList({ sources }: { sources: readonly SourceItem[] }) {
  if (sources.length === 0) return null;
  return (
    <details className="rounded-lg border bg-muted/30">
      <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium">
        {sources.length === 1 ? "1 source citée" : `${sources.length} sources citées`}
      </summary>
      <ul className="flex flex-col gap-4 px-4 pb-4" aria-label="Sources citées">
        {sources.map((source) => (
          <li key={source.slug} className="flex flex-col gap-2 border-t pt-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{source.title}</span>
              {source.demonstration ? <Badge variant="outline">démonstration</Badge> : null}
            </div>
            <p className="text-muted-foreground">
              {source.organization}, « {source.sourceTitle} » ({source.licence}), vérifiée le{" "}
              {formatDate(source.checkedOn)}
            </p>
            {source.quotes.map((quote) => (
              <blockquote key={quote} className="border-l-2 border-primary/40 pl-3 italic">
                {quote}
              </blockquote>
            ))}
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-1 self-start text-primary underline-offset-4 hover:underline"
            >
              Lire le document d&apos;origine
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
