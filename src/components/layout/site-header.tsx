import Link from "next/link";
import { MinistryLogo } from "@/components/brand/ministry-logo";
import { HeaderAccountButton } from "@/components/layout/header-account-button";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const NAV = [
  { href: "/", label: "Accueil" },
  { href: "/carte", label: "Carte agricole" },
  { href: "/palmares", label: "Palmarès" },
  { href: "/#espaces", label: "Les espaces" },
  { href: "/design-system", label: "Design system", desktopOnly: true },
] as const;

// En-tête public des portails de l'administration : une bande blanche avec l'identité du
// ministère et l'accès à son espace, puis une barre de navigation marine en capitales. Seule la
// marque du ministère apparaît (consigne : pas de logo propre à la plateforme). Une légère marge
// encadre le contenu de la bande blanche comme de la barre de navigation, à gauche et à droite.
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 print:hidden">
      <div className="border-b bg-background">
        <div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="rounded-sm focus-visible:ring-2 focus-visible:ring-ring">
            <MinistryLogo />
            <span className="sr-only"> — Accueil de la plateforme</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <HeaderAccountButton />
          </div>
        </div>
      </div>
      <nav aria-label="Navigation principale" className="bg-band text-band-foreground">
        <ul className="mx-auto flex w-full max-w-6xl items-stretch overflow-x-auto px-4 sm:px-6 lg:px-8">
          {NAV.map((item) => (
            <li key={item.href} className={"desktopOnly" in item ? "hidden sm:block" : undefined}>
              <Link
                href={item.href}
                className="flex h-11 items-center px-3 text-xs font-semibold tracking-wide whitespace-nowrap uppercase hover:bg-white/10 focus-visible:bg-white/15 focus-visible:outline-none"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
