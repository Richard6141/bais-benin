import type { ReactNode } from "react";
import { FarmerShell } from "@/features/account/farmer-shell";
import { getCurrentUser } from "@/features/auth/session";
import { isDemoPhone } from "@/lib/auth/phone";

// Navigation commune de l'espace producteur. L'accès reste contrôlé par chaque page (requireRole) :
// la navigation n'apparaît qu'à un compte producteur, jamais sur l'écran de refus d'un autre rôle.
export default async function FarmerLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user?.actor.grants.some((grant) => grant.role === "FARMER")) return <>{children}</>;
  return (
    <FarmerShell userId={user.id} demo={isDemoPhone(user.phoneNumber ?? "")}>
      {children}
    </FarmerShell>
  );
}
