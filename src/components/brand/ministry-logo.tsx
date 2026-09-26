import Image from "next/image";
import { cn } from "@/lib/utils";

interface MinistryLogoProps {
  /** Hauteur par classes (par défaut 44 px sur téléphone, 56 px au-delà) ; la largeur suit. */
  className?: string;
}

// Logo complet officiel du ministère (armoiries, dénomination, filet tricolore, « République du
// Bénin »), tel qu'en en-tête de agriculture.gouv.bj : seule marque des en-têtes de la plateforme.
// Fichiers officiels dont seules les marges transparentes ont été retirées, pour que la hauteur
// affichée soit celle du logo lui-même. Version couleur en thème clair, blanche en thème sombre.
// Source et crédit : docs/credits-images.md.
const ALT = "Ministère de l'Agriculture, de l'Élevage et de la Pêche, République du Bénin";

export function MinistryLogo({ className }: MinistryLogoProps) {
  return (
    <span className={cn("inline-flex h-11 shrink-0 items-center sm:h-14", className)}>
      <Image
        src="/images/logos/maep-benin-logo.png"
        alt={ALT}
        width={688}
        height={165}
        className="block h-full w-auto dark:hidden"
        priority
      />
      <Image
        src="/images/logos/maep-benin-logo-blanc.png"
        alt={ALT}
        width={496}
        height={119}
        className="hidden h-full w-auto dark:block"
        priority
      />
    </span>
  );
}
