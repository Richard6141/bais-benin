import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PhoneSignIn } from "@/features/auth/phone-sign-in";
import { getCurrentUser, homeFor } from "@/features/auth/session";
import { safeNextPath } from "@/features/auth/safe-next-path";

export const metadata: Metadata = { title: "Connexion" };

export default async function SignInPage({ searchParams }: PageProps<"/connexion">) {
  const params = await searchParams;
  const nextPath = safeNextPath(params.suite);
  const user = await getCurrentUser();
  if (user) redirect((nextPath ?? homeFor(user)) as Route);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Se connecter</h1>
        <p className="mt-2 text-muted-foreground">
          Avec votre numéro de téléphone. Aucun mot de passe à retenir.
        </p>
      </div>
      <PhoneSignIn nextPath={nextPath} />
      <p className="border-t pt-6 text-sm text-muted-foreground">
        Vous représentez une administration, une coopérative ou une entreprise ?{" "}
        <Link
          href="/connexion/institution"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Connexion institutionnelle
        </Link>
      </p>
    </div>
  );
}
