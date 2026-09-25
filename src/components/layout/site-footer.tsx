import Link from "next/link";
import { Monogram } from "@/components/brand/monogram";

// Pied de page institutionnel : identité, nature de la plateforme, liens utiles.
export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-card">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 text-sm sm:px-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="max-w-sm">
          <div className="flex items-center gap-3">
            <Monogram className="size-8" />
            <span className="font-semibold">Bénin Agricultural Intelligence System</span>
          </div>
          <p className="mt-3 text-muted-foreground">
            Plateforme de démonstration. Les exploitations, producteurs et chiffres présentés sont
            fictifs ; aucune personne réelle n&apos;est décrite.
          </p>
        </div>
        <div>
          <p className="font-medium">Plateforme</p>
          <ul className="mt-3 flex flex-col gap-2 text-muted-foreground">
            <li>
              <Link href="/#espaces" className="hover:text-foreground">
                Les six espaces
              </Link>
            </li>
            <li>
              <Link href="/connexion" className="hover:text-foreground">
                Se connecter
              </Link>
            </li>
            <li>
              <Link href="/design-system" className="hover:text-foreground">
                Design system
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="font-medium">Données</p>
          <ul className="mt-3 flex flex-col gap-2 text-muted-foreground">
            <li>Limites administratives : geoBoundaries (CC BY 4.0)</li>
            <li>
              <Link href="/credits" className="hover:text-foreground">
                Crédits photographiques
              </Link>
            </li>
            <li>
              {/* Point de contrôle JSON, pas une page : lien simple, sans préchargement. */}
              <a href="/api/health" className="hover:text-foreground">
                État du service
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
