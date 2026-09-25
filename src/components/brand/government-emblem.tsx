import Image from "next/image";
import { cn } from "@/lib/utils";

interface GovernmentEmblemProps {
  className?: string;
  size?: number;
}

// Armoiries de la République du Bénin, utilisées par les portails de l'administration
// (dont agriculture.gouv.bj). Fond clair d'origine conservé sur une plaque arrondie pour
// rester lisible en thème sombre. Source et crédit : docs/credits-images.md.
export function GovernmentEmblem({ className, size = 44 }: GovernmentEmblemProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-sm bg-white p-0.5 ring-1 ring-black/5",
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
