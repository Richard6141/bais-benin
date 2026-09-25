import { MapPinOff } from "lucide-react";

// Remplace une carte que le navigateur ne peut pas afficher (WebGL2 absent) : les chiffres de la
// page restent lisibles, seule la carte manque.
export function MapUnavailable({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={
        className ??
        "flex h-full min-h-60 w-full flex-col items-center justify-center gap-2 bg-muted/50 p-6 text-center"
      }
    >
      <MapPinOff className="size-6 text-muted-foreground" aria-hidden />
      <p className="font-semibold">Carte indisponible sur cet appareil</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Le navigateur ne prend pas en charge l&apos;affichage des cartes (WebGL2). Les chiffres de
        la page restent consultables ; essayez un navigateur à jour pour voir la carte.
      </p>
    </div>
  );
}
