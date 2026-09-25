import Link from "next/link";
import type { ReactNode } from "react";
import { MinistryLogo } from "@/components/brand/ministry-logo";
import { SiteFooter } from "@/components/layout/site-footer";

// Écrans d'identification : une colonne étroite, pas de navigation secondaire,
// pour que l'attention reste sur le seul champ demandé. Même identité que les autres en-têtes :
// le bloc du ministère seul, sans marque propre à la plateforme.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b-4 border-band">
        <div className="flex h-20 w-full items-center">
          <Link href="/" className="rounded-sm focus-visible:ring-2 focus-visible:ring-ring">
            <MinistryLogo />
            <span className="sr-only"> — Accueil de la plateforme</span>
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
