import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/features/auth/session";
import { safeNextPath } from "@/features/auth/safe-next-path";
import { SignInForm } from "@/features/auth/sign-in-form";
import { DEMO_SIGN_IN_ACCOUNTS } from "@/lib/auth/demo-accounts";
import { getServerEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Connexion" };

// Profil choisi sur l'accueil (« Qui êtes-vous ? ») : il ne change que le texte d'accueil et
// l'ordre des comptes de démonstration. La connexion reste la même pour tous (NPI et téléphone),
// et l'espace ouvert ensuite dépend du rôle du compte, jamais de ce paramètre.
const PROFILES = {
  producteur: {
    title: "Espace producteur",
    note: "Votre compte est créé à votre première connexion.",
    demoKey: "agricultrice-djougou",
  },
  agent: {
    title: "Espace agent de terrain",
    note: "Votre compte est ouvert par votre direction, avec le NPI et le numéro que vous lui avez communiqués.",
    demoKey: "agent-djougou",
  },
  ministere: {
    title: "Centre de pilotage",
    note: "Votre compte est ouvert par l'administration, avec le NPI et le numéro que vous lui avez communiqués.",
    demoKey: "ministere",
  },
} as const;

type ProfileKey = keyof typeof PROFILES;

function readProfile(value: string | string[] | undefined): ProfileKey | null {
  return typeof value === "string" && value in PROFILES ? (value as ProfileKey) : null;
}

export default async function SignInPage({ searchParams }: PageProps<"/connexion">) {
  const params = await searchParams;
  const nextPath = safeNextPath(params.suite);
  const user = await getCurrentUser();
  if (user) redirect((nextPath ?? homeFor(user)) as Route);

  const profile = readProfile(params.profil);
  const env = getServerEnv();
  const accounts = profile
    ? [...DEMO_SIGN_IN_ACCOUNTS].sort(
        (a, b) =>
          Number(b.key === PROFILES[profile].demoKey) - Number(a.key === PROFILES[profile].demoKey),
      )
    : DEMO_SIGN_IN_ACCOUNTS;
  const demo =
    env.APP_ENV !== "production" && env.OTP_DEMO_CODE && env.DEMO_SIGNIN_PANEL !== "0"
      ? { accounts, code: env.OTP_DEMO_CODE }
      : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        {profile ? (
          <p className="mb-1 text-sm font-semibold text-primary">{PROFILES[profile].title}</p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Se connecter</h1>
        <p className="mt-2 text-muted-foreground">
          Avec votre NPI et le numéro de téléphone qui y est relié.
        </p>
        {profile ? (
          <p className="mt-3 text-sm text-muted-foreground">{PROFILES[profile].note}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground">
            <li>Agriculteurs : votre compte est créé à votre première connexion.</li>
            <li>
              Agents, ministère, coopératives et acheteurs : votre compte est ouvert par
              l&apos;administration, avec le NPI et le numéro que vous lui avez communiqués.
            </li>
          </ul>
        )}
      </div>
      <SignInForm nextPath={nextPath} demo={demo} />
    </div>
  );
}
