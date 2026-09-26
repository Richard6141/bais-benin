import { WifiOff } from "lucide-react";
import type { Metadata } from "next";
import { OfflineSpaceLinks } from "@/components/feedback/offline-space-links";

export const metadata: Metadata = { title: "Hors connexion" };

// Page de repli servie par le service worker quand une page de navigation n'est ni disponible
// en réseau ni en cache (ADR-0005). Autonome : aucune donnée distante, aucun script lourd ;
// les pages déjà visitées de l'espace agent restent accessibles depuis le cache.
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <WifiOff className="size-7" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-balance">
        Cette page n&apos;est pas disponible sans réseau
      </h1>
      <p className="max-w-md text-base text-pretty text-muted-foreground">
        Vos saisies enregistrées restent conservées sur cet appareil et partiront d&apos;elles-mêmes
        au retour de la connexion. Les pages que vous avez déjà ouvertes restent accessibles.
      </p>
      <OfflineSpaceLinks />
    </main>
  );
}
