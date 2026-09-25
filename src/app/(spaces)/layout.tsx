import type { ReactNode } from "react";
import { SiteFooter } from "@/components/layout/site-footer";
import { SessionIdentityGuard } from "@/features/auth/session-identity-guard";
import { SpaceHeader } from "@/features/auth/space-header";
import { requireUser } from "@/features/auth/session";

// Enveloppe commune des espaces authentifiés : en-tête avec identité, compte et déconnexion.
export default async function SpacesLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <>
      {/* B2 : détecte une page authentifiée servie depuis un cache d'un autre compte. */}
      <SessionIdentityGuard userId={user.id} />
      <SpaceHeader user={{ name: user.name, primaryRole: user.primaryRole }} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      <SiteFooter />
    </>
  );
}
