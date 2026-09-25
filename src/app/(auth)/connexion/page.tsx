import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/features/auth/session";
import { safeNextPath } from "@/features/auth/safe-next-path";
import { SignInForm } from "@/features/auth/sign-in-form";
import { DEMO_SIGN_IN_ACCOUNTS } from "@/lib/auth/demo-accounts";
import { getServerEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Connexion" };

export default async function SignInPage({ searchParams }: PageProps<"/connexion">) {
  const params = await searchParams;
  const nextPath = safeNextPath(params.suite);
  const user = await getCurrentUser();
  if (user) redirect((nextPath ?? homeFor(user)) as Route);

  const env = getServerEnv();
  const demo =
    env.APP_ENV !== "production" && env.OTP_DEMO_CODE
      ? { accounts: DEMO_SIGN_IN_ACCOUNTS, code: env.OTP_DEMO_CODE }
      : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Se connecter</h1>
        <p className="mt-2 text-muted-foreground">
          Avec votre NPI et le numéro de téléphone qui y est relié. Un compte est créé à votre
          première connexion.
        </p>
      </div>
      <SignInForm nextPath={nextPath} demo={demo} />
    </div>
  );
}
