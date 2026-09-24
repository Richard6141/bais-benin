import { cn } from "@/lib/utils";

interface MonogramProps {
  className?: string;
  title?: string;
}

// Monogramme BAIS : une grille (la donnée) traversée d'une diagonale
// évoquant le relief nord-sud du pays. Deux tons, aucun symbole agricole.
export function Monogram({ className, title = "BAIS" }: MonogramProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      role="img"
      aria-label={title}
      className={cn("size-9", className)}
      fill="none"
    >
      <rect x="2" y="2" width="36" height="36" rx="8" className="fill-primary" />
      <g className="stroke-primary-foreground/35" strokeWidth="1">
        <path d="M14 2v36M26 2v36M2 14h36M2 26h36" />
      </g>
      <path d="M8 30 L32 10" className="stroke-laterite" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="32" cy="10" r="3" className="fill-chalk" />
    </svg>
  );
}
