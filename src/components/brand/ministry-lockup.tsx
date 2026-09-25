import { GovernmentEmblem } from "@/components/brand/government-emblem";
import { cn } from "@/lib/utils";

interface MinistryLockupProps {
  /** Texte clair sur fond sombre (pied de page). */
  inverted?: boolean;
  /** Armoiries plus petites (en-têtes sur téléphone). */
  compact?: boolean;
  className?: string;
}

// Identité du ministère, seule marque de la plateforme : les armoiries, le nom du ministère, un
// filet aux trois couleurs du drapeau (aplats, sans dégradé) et « République du Bénin », comme sur
// l'en-tête de agriculture.gouv.bj. Aucun logo propre à la plateforme ne s'y ajoute.
export function MinistryLockup({
  inverted = false,
  compact = false,
  className,
}: MinistryLockupProps) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <GovernmentEmblem size={compact ? 40 : 48} />
      <span className="flex flex-col gap-1 leading-tight">
        <span
          className={cn(
            "text-[11px] font-bold tracking-wide uppercase sm:text-xs",
            inverted ? "text-white" : "text-heading",
          )}
        >
          Ministère de l&apos;Agriculture,
          <br />
          de l&apos;Élevage et de la Pêche
        </span>
        <span aria-hidden className="flex h-[3px] w-full max-w-40">
          <span className="flex-1 bg-[var(--flag-green)]" />
          <span className="flex-1 bg-[var(--flag-yellow)]" />
          <span className="flex-1 bg-[var(--flag-red)]" />
        </span>
        <span
          className={cn(
            "text-[10px] font-medium tracking-wide uppercase sm:text-[11px]",
            inverted ? "text-white/80" : "text-muted-foreground",
          )}
        >
          République du Bénin
        </span>
      </span>
    </span>
  );
}
