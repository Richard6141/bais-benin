import { WifiOff } from "lucide-react";

export const metadata = {
  title: "Hors connexion",
};

// Page servie par le service worker quand une navigation échoue faute de réseau.
// Elle doit rester autonome : aucune donnée distante, aucun script lourd.
export default function OfflinePage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <WifiOff className="size-6" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Vous êtes hors connexion</h1>
      <p className="mt-3 max-w-md text-balance text-muted-foreground">
        Cette page n&apos;est pas encore disponible sans réseau. Vos saisies enregistrées restent
        conservées sur cet appareil et seront synchronisées au retour de la connexion.
      </p>
    </main>
  );
}
