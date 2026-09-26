import { CircleCheck, CircleX, SearchX } from "lucide-react";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { verifyAttestation, formatAttestationCode } from "@/modules/attestations";

export const metadata: Metadata = {
  title: "Vérification d'attestation",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Porto-Novo" });
const area = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

// Page ouverte par le code QR d'une attestation (banque, assureur, programme d'aide) : dit si
// l'attestation existe, si elle a été retirée, et rappelle l'essentiel de ce qu'elle atteste, pour
// comparaison avec le papier présenté. Sans compte ni connexion.
export default async function VerifyAttestationPage(props: PageProps<"/verifier/[code]">) {
  const { code } = await props.params;
  const attestation = await verifyAttestation(code);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight">Vérification d&apos;attestation</h1>
        {!attestation ? (
          <section className="flex gap-3 rounded-lg border bg-card p-5">
            <SearchX aria-hidden className="mt-0.5 size-6 shrink-0 text-muted-foreground" />
            <div className="flex flex-col gap-1">
              <p className="font-semibold">Aucune attestation ne porte ce numéro</p>
              <p className="text-sm text-muted-foreground">
                Vérifiez le numéro saisi. Un document dont le numéro est inconnu du registre
                agricole national ne doit pas être accepté.
              </p>
            </div>
          </section>
        ) : (
          <section className="flex flex-col gap-4 rounded-lg border bg-card p-5">
            <div className="flex gap-3">
              {attestation.revokedAt ? (
                <CircleX aria-hidden className="mt-0.5 size-6 shrink-0 text-critical" />
              ) : (
                <CircleCheck aria-hidden className="mt-0.5 size-6 shrink-0 text-forest" />
              )}
              <div className="flex flex-col gap-1">
                <p className="font-semibold">
                  {attestation.revokedAt
                    ? `Attestation retirée le ${date.format(attestation.revokedAt)}`
                    : "Attestation authentique et en vigueur"}
                </p>
                <p className="text-sm text-muted-foreground">
                  N° {formatAttestationCode(attestation.code)}, établie le{" "}
                  {date.format(attestation.issuedAt)}. Comparez ces informations au document
                  présenté.
                </p>
              </div>
            </div>
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-muted-foreground">Titulaire</dt>
              <dd className="font-medium">
                {attestation.snapshot.holder.displayName}
                {attestation.snapshot.holder.identityVerified ? " (identité contrôlée, ANIP)" : ""}
              </dd>
              <dt className="text-muted-foreground">Exploitation</dt>
              <dd className="font-medium">
                {attestation.snapshot.farm.code}, {attestation.snapshot.farm.communeName} (
                {attestation.snapshot.farm.departementName})
              </dd>
              <dt className="text-muted-foreground">Surface</dt>
              <dd className="font-medium">
                {attestation.snapshot.parcels} parcelle(s),{" "}
                {area.format(
                  attestation.snapshot.measuredAreaHa ?? attestation.snapshot.declaredAreaHa,
                )}{" "}
                ha {attestation.snapshot.measuredAreaHa !== null ? "mesurés" : "déclarés"}
              </dd>
              {attestation.snapshot.campaign ? (
                <>
                  <dt className="text-muted-foreground">
                    Cultures {attestation.snapshot.campaign.code}
                  </dt>
                  <dd className="font-medium">
                    {attestation.snapshot.campaign.crops.map((crop) => crop.name).join(", ") ||
                      "Aucune"}
                  </dd>
                </>
              ) : null}
            </dl>
          </section>
        )}
        <p className="text-sm text-muted-foreground">
          Registre agricole national du Bénin, ministère de l&apos;Agriculture, de l&apos;Élevage et
          de la Pêche.
        </p>
      </main>
    </>
  );
}
