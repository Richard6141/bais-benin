import { cn } from "@/lib/utils";

interface SourceCaptionProps {
  source: string;
  date?: string;
  className?: string;
}

// Toute donnée affichée porte sa provenance (docs/01, principe 2).
// Ce composant est la forme la plus discrète de cette règle.
export function SourceCaption({ source, date, className }: SourceCaptionProps) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      Source : {source}
      {date ? ` · ${date}` : null}
    </p>
  );
}
