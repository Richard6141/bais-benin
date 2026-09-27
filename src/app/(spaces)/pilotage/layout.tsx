import { Suspense, type ReactNode } from "react";
import { getCurrentUser } from "@/features/auth/session";
import { PilotageNav } from "@/features/dashboard/pilotage-nav";
import { GuidedTour } from "@/features/onboarding/guided-tour";
import { isDemoPhone } from "@/lib/auth/phone";
import { countNewFeedback } from "@/modules/feedback";

// Navigation commune du pilotage. L'accès reste contrôlé par chaque page (requireRole, avec le
// chemin de retour) : la barre n'apparaît qu'au ministère, jamais sur l'écran de refus d'un
// autre rôle.
export default async function PilotageLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const showNav = Boolean(user?.actor.grants.some((g) => g.role === "ADMIN_STATE"));
  const newFeedback = showNav && user ? ((await countNewFeedback(user.actor)) ?? 0) : 0;
  return (
    <div className="flex flex-col gap-6">
      {showNav ? <PilotageNav newFeedback={newFeedback} /> : null}
      {showNav && user ? (
        <Suspense fallback={null}>
          <GuidedTour
            role="ministere"
            userId={user.id}
            demo={isDemoPhone(user.phoneNumber ?? "")}
          />
        </Suspense>
      ) : null}
      {children}
    </div>
  );
}
