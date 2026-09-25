import Image from "next/image";
import { cn } from "@/lib/utils";

interface GovernmentEmblemProps {
  className?: string;
  /** Hauteur d'affichage en pixels ; la largeur suit le ratio réel de chaque image. */
  height?: number;
}

// Dimensions réelles des fichiers officiels (agriculture.gouv.bj), pour calculer une largeur
// cohérente à partir de la hauteur demandée sans déformer le logo.
const COLOR_RATIO = 800 / 257;
const WHITE_RATIO = 540 / 144;

// Logo complet du ministère (armoiries, dénomination et devise tricolore), tel qu'utilisé sur
// les portails de l'administration. Deux fichiers officiels : la version couleur sur fond clair,
// la version blanche pour les fonds sombres (thème sombre de la plateforme). Fonds transparents
// d'origine, aucune retouche. Source et crédit : docs/credits-images.md.
export function GovernmentEmblem({ className, height = 40 }: GovernmentEmblemProps) {
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      <Image
        src="/images/logos/maep-benin-logo-complet.png"
        alt="Ministère de l'Agriculture, de l'Élevage et de la Pêche — République du Bénin"
        width={Math.round(height * COLOR_RATIO)}
        height={height}
        className="block object-contain dark:hidden"
        style={{ height }}
        priority
      />
      <Image
        src="/images/logos/maep-benin-logo-complet-blanc.png"
        alt="Ministère de l'Agriculture, de l'Élevage et de la Pêche — République du Bénin"
        width={Math.round(height * WHITE_RATIO)}
        height={height}
        className="hidden object-contain dark:block"
        style={{ height }}
        priority
      />
    </span>
  );
}
