"use client";

import { WifiOff } from "lucide-react";
import { useIsOnline } from "@/lib/offline/use-online";

export { useIsOnline };

export function OfflineBanner() {
  const isOnline = useIsOnline();
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-offline px-4 py-2 text-sm font-medium text-paper"
    >
      <WifiOff className="size-4" aria-hidden />
      <span>Hors connexion : vos saisies sont conservées sur cet appareil.</span>
    </div>
  );
}
