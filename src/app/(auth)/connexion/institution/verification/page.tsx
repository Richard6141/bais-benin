import type { Metadata } from "next";
import { TotpVerification } from "@/features/auth/totp-verification";
import { safeNextPath } from "@/features/auth/safe-next-path";

export const metadata: Metadata = { title: "Double authentification" };

export default async function TwoFactorPage({
  searchParams,
}: PageProps<"/connexion/institution/verification">) {
  const params = await searchParams;
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Double authentification
        </h1>
        <p className="mt-2 text-muted-foreground">
          Saisissez le code affiché par votre application d&apos;authentification.
        </p>
      </div>
      <TotpVerification nextPath={safeNextPath(params.suite)} />
    </div>
  );
}
