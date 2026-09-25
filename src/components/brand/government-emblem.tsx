import Image from "next/image";
import { cn } from "@/lib/utils";

interface GovernmentEmblemProps {
  className?: string;
  /** Côté de la plaque carrée, en pixels. */
  size?: number;
}

// Armoiries de la République du Bénin seules, sans dénomination : pour le bloc du pied de page
// (MinistryLockup), où le nom du ministère est écrit à côté en texte, et pour les icônes de
// l'application. Plaque blanche pour rester lisible sur fond sombre. Source : docs/credits-images.md.
export function GovernmentEmblem({ className, size = 48 }: GovernmentEmblemProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-sm bg-white p-1 ring-1 ring-black/5",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src="/images/logos/maep-benin.png"
        alt="Armoiries de la République du Bénin"
        width={size}
        height={size}
        className="h-full w-full object-contain"
      />
    </span>
  );
}
