import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InstitutionSignIn } from "@/features/auth/institution-sign-in";
import { getCurrentUser, homeFor } from "@/features/auth/session";
import { safeNextPath } from "@/features/auth/safe-next-path";

export const metadata: Metadata = { title: "Connexion institutionnelle" };

export default async function InstitutionSignInPage({
  searchParams,
}: PageProps<"/connexion/institution">) {
  const params = await searchParams;
  const nextPath = safeNextPath(params.suite);
  const user = await getCurrentUser();
  if (user) redirect((nextPath ?? homeFor(user)) as Route);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Connexion institutionnelle
        </h1>
        <p className="mt-2 text-muted-foreground">
          Ministère, communes, coopératives et acheteurs. Les comptes sont créés sur invitation.
        </p>
      </div>
      <InstitutionSignIn nextPath={nextPath} />
      <p className="border-t pt-6 text-sm text-muted-foreground">
        Vous êtes agriculteur ou agent de terrain ?{" "}
        <Link
          href="/connexion"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Connexion par téléphone
        </Link>
      </p>
    </div>
  );
}
