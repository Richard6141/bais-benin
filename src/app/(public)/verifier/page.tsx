import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeAttestationCode } from "@/modules/attestations";

export const metadata: Metadata = { title: "Vérifier une attestation" };

// Saisie du numéro d'une attestation, pour qui n'a pas pu scanner le code QR. Un simple formulaire
// sans script : le numéro normalisé mène à la page de vérification.
export default async function VerifyEntryPage(props: PageProps<"/verifier">) {
  const params = (await props.searchParams) as Record<string, string | string[] | undefined>;
  const raw = typeof params.code === "string" ? params.code : "";
  const code = raw ? normalizeAttestationCode(raw) : null;
  if (code) redirect(`/verifier/${code}` as Route);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight">Vérifier une attestation</h1>
        <form method="get" action="/verifier" className="flex flex-col gap-3">
          <Label htmlFor="code">Numéro de l&apos;attestation</Label>
          <Input
            id="code"
            name="code"
            required
            autoComplete="off"
            autoCapitalize="characters"
            defaultValue={raw}
            aria-invalid={raw !== "" && !code}
            className="h-11 font-mono tracking-wider uppercase"
          />
          {raw && !code ? (
            <p role="alert" className="text-sm text-critical">
              Numéro incomplet : 16 caractères, lettres et chiffres.
            </p>
          ) : null}
          <Button type="submit" className="h-11 w-fit">
            Vérifier
          </Button>
        </form>
      </main>
    </>
  );
}
