import { ChevronDown, Menu } from "lucide-react";
import Link from "next/link";
import { MinistryLogo } from "@/components/brand/ministry-logo";
import { HeaderAccountButton } from "@/components/layout/header-account-button";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const NAV = [
  { href: "/", label: "Accueil" },
  { href: "/carte", label: "Carte agricole" },
  { href: "/palmares", label: "Palmarès" },
  { href: "/#qui-etes-vous", label: "Qui êtes-vous ?" },
] as const;

// En-tête public des portails de l'administration : une bande blanche avec l'identité du
// ministère et l'accès à son espace, puis une barre de navigation marine en capitales. Seule la
// marque du ministère apparaît (consigne : pas de logo propre à la plateforme). Une légère marge
// encadre le contenu de la bande blanche comme de la barre de navigation, à gauche et à droite.
// Sous 640 px, les entrées ne tiennent plus sur une ligne : la barre devient un bouton « Menu »
// qui les déplie en liste, sans défilement horizontal ni libellé coupé.
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 print:hidden">
      <div className="border-b bg-background">
        <div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="rounded-sm focus-visible:ring-2 focus-visible:ring-ring">
            <MinistryLogo />
            <span className="sr-only">, Accueil de la plateforme</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <HeaderAccountButton />
          </div>
        </div>
      </div>
      <nav aria-label="Navigation principale" className="bg-band text-band-foreground">
        <ul className="mx-auto hidden w-full max-w-6xl items-stretch px-4 sm:flex sm:px-6 lg:px-8">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex h-11 items-center px-3 text-xs font-semibold tracking-wide whitespace-nowrap uppercase hover:bg-white/10 focus-visible:bg-white/15 focus-visible:outline-none"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <details className="group sm:hidden">
          <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-4 text-xs font-semibold tracking-wide uppercase focus-visible:bg-white/15 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <Menu className="size-4" aria-hidden />
              Menu
            </span>
            <ChevronDown
              className="size-4 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <ul className="flex flex-col border-t border-white/15 px-2 py-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex h-11 items-center rounded-sm px-2 text-sm font-semibold hover:bg-white/10 focus-visible:bg-white/15 focus-visible:outline-none"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      </nav>
    </header>
  );
}
