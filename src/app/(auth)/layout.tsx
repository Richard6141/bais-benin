import Link from "next/link";
import type { ReactNode } from "react";
import { MinistryLockup } from "@/components/brand/ministry-lockup";
import { SiteFooter } from "@/components/layout/site-footer";

// Écrans d'identification : une colonne étroite, pas de navigation secondaire,
// pour que l'attention reste sur le seul champ demandé. Même identité que les autres en-têtes :
// le bloc du ministère seul, sans marque propre à la plateforme.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b-4 border-band">
        <div className="mx-auto flex h-20 w-full max-w-6xl items-center px-4 sm:px-6">
          <Link href="/" className="rounded-sm focus-visible:ring-2 focus-visible:ring-ring">
            <MinistryLockup />
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
