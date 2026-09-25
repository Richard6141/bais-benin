import Link from "next/link";
import { GovernmentEmblem } from "@/components/brand/government-emblem";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";

// L'en-tête porte l'identité de l'État (armoiries), sans doublon avec une marque produit :
// c'est une plateforme du gouvernement, pas un produit tiers qui s'y ajoute.
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <GovernmentEmblem />
          <span className="sr-only">BAIS — Accueil</span>
        </Link>
        <nav aria-label="Navigation principale" className="flex items-center gap-1 text-sm">
          <Link
            href="/carte"
            className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Carte
          </Link>
          <Link
            href="/design-system"
            className="hidden rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:inline-block"
          >
            Design system
          </Link>
          <Button asChild size="sm" className="ml-1">
            <Link href="/connexion">Se connecter</Link>
          </Button>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
