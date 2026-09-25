import Link from "next/link";
import { MinistryLockup } from "@/components/brand/ministry-lockup";

// Pied de page institutionnel des portails de l'administration : identité du ministère, nature
// de la plateforme, liens utiles, puis une barre de mentions. Pas de logo propre à la plateforme.
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-marine-strong text-white dark:bg-[#07111d] print:hidden">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 text-sm sm:px-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="max-w-sm">
          <MinistryLockup inverted />
          <p className="mt-4 text-white/80">
            Plateforme de démonstration. Les exploitations, producteurs et chiffres présentés sont
            fictifs ; aucune personne réelle n&apos;est décrite.
          </p>
        </div>
        <div>
          <p className="text-xs font-bold tracking-wide uppercase">Plateforme</p>
          <ul className="mt-3 flex flex-col gap-2 text-white/80">
            <li>
              <Link
                href="/#espaces"
                className="underline-offset-4 hover:text-white hover:underline"
              >
                Les six espaces
              </Link>
            </li>
            <li>
              <Link
                href="/connexion"
                className="underline-offset-4 hover:text-white hover:underline"
              >
                Se connecter
              </Link>
            </li>
            <li>
              <Link
                href="/design-system"
                className="underline-offset-4 hover:text-white hover:underline"
              >
                Design system
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold tracking-wide uppercase">Données</p>
          <ul className="mt-3 flex flex-col gap-2 text-white/80">
            <li>Limites administratives : geoBoundaries (CC BY 4.0)</li>
            <li>
              <Link href="/credits" className="underline-offset-4 hover:text-white hover:underline">
                Crédits photographiques
              </Link>
            </li>
            <li>
              {/* Point de contrôle JSON, pas une page : lien simple, sans préchargement. */}
              <a href="/api/health" className="underline-offset-4 hover:text-white hover:underline">
                État du service
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/15">
        <p className="mx-auto w-full max-w-6xl px-4 py-4 text-xs text-white/70 sm:px-6">
          © {year} République du Bénin · Ministère de l&apos;Agriculture, de l&apos;Élevage et de la
          Pêche
        </p>
      </div>
    </footer>
  );
}
