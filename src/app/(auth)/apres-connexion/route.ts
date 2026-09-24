import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, homeFor } from "@/features/auth/session";
import { safeNextPath } from "@/features/auth/safe-next-path";
import { recordAudit } from "@/modules/audit";

export const dynamic = "force-dynamic";

// Point d'atterrissage après authentification : journalise la connexion et envoie
// l'utilisateur vers l'espace de son rôle principal, ou vers la page demandée.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/connexion", request.url));

  await recordAudit({
    action: "auth.sign_in",
    actorId: user.id,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request.headers.get("user-agent"),
  });

  const nextPath = safeNextPath(request.nextUrl.searchParams.get("suite") ?? undefined);
  return NextResponse.redirect(new URL(nextPath ?? homeFor(user), request.url));
}
