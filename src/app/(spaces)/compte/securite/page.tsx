import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { totpQrSvg } from "@/features/account/qr";
import { TwoFactorSetup } from "@/features/account/two-factor-setup";
import { requireUser } from "@/features/auth/session";

export const metadata: Metadata = { title: "Double authentification" };

export default async function SecurityPage({ searchParams }: PageProps<"/compte/securite">) {
  const user = await requireUser({ returnTo: "/compte/securite" });
  if (user.twoFactorEnabled) redirect("/compte");
  const params = await searchParams;
  const isPhoneAccount = user.email.endsWith("@telephone.bais.invalid");

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
      <PageHeader
        eyebrow="Sécurité"
        title="Activer la double authentification"
        description="Un code supplémentaire, généré par une application sur votre téléphone, protège votre compte même si votre mot de passe fuit."
      />
      {isPhoneAccount ? (
        <p className="text-sm text-muted-foreground">
          La double authentification s&apos;applique aux comptes institutionnels. Votre compte par
          téléphone est protégé par le code envoyé à chaque connexion.
        </p>
      ) : (
        <TwoFactorSetup mandatory={params.obligatoire === "1"} qrSvgFor={totpQrSvg} />
      )}
    </div>
  );
}
