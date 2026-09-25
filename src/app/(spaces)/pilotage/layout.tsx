import type { ReactNode } from "react";
import { getCurrentUser } from "@/features/auth/session";
import { PilotageNav } from "@/features/dashboard/pilotage-nav";

// Navigation commune du pilotage. L'accès reste contrôlé par chaque page (requireRole, avec le
// chemin de retour) : la barre n'apparaît qu'au ministère doté de la double authentification,
// jamais sur l'écran de refus d'un autre rôle.
export default async function PilotageLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const showNav =
    Boolean(user?.twoFactorEnabled) &&
    Boolean(user?.actor.grants.some((g) => g.role === "ADMIN_STATE"));
  return (
    <div className="flex flex-col gap-6">
      {showNav ? <PilotageNav /> : null}
      {children}
    </div>
  );
}
