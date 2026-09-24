import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Garde rapide des espaces authentifiés : la présence du cookie de session suffit ici
// (aucun appel à la base). La vérification réelle de la session et des rôles a lieu
// dans les layouts serveur via requireRole().
const protectedPrefixes = [
  "/agriculteur",
  "/agent",
  "/cooperative",
  "/acheteur",
  "/commune",
  "/pilotage",
  "/compte",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!isProtected) return NextResponse.next();

  const sessionCookie = getSessionCookie(request, { cookiePrefix: "bais" });
  if (sessionCookie) return NextResponse.next();

  const target = new URL("/connexion", request.url);
  target.searchParams.set("suite", pathname);
  return NextResponse.redirect(target);
}

export const config = {
  matcher: ["/((?!api|_next|serwist|icons|manifest.webmanifest|~offline).*)"],
};
