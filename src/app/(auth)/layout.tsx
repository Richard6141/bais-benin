import Link from "next/link";
import type { ReactNode } from "react";
import { GovernmentEmblem } from "@/components/brand/government-emblem";
import { SiteFooter } from "@/components/layout/site-footer";

// Écrans d'identification : une colonne étroite, pas de navigation secondaire,
// pour que l'attention reste sur le seul champ demandé. Même identité que les autres en-têtes :
// les armoiries de l'État seules, sans marque produit à côté.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b border-border/70">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <GovernmentEmblem />
            <span className="sr-only">BAIS — Accueil</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-10 sm:px-6 sm:py-16">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
