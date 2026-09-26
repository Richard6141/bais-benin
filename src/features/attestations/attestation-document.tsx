import { renderSVG } from "uqr";
import { MinistryLogo } from "@/components/brand/ministry-logo";
import { formatAttestationCode, type AttestationView } from "@/modules/attestations";

// Attestation d'exploitation mise en page comme un document officiel : en-tête du ministère,
// titulaire, exploitation, surfaces, cultures, récoltes, puis le code QR et le code à recopier qui
// mènent à la page publique de vérification. Faite pour l'écran et pour l'impression (A4).

const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Porto-Novo" });
const area = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const kilos = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

const VERIFICATION: Record<string, string> = {
  DECLARED: "Déclarée par le producteur, pas encore vérifiée",
  AGENT_VERIFIED: "Vérifiée par un agent du ministère",
  FIELD_VERIFIED: "Vérifiée sur le terrain par un agent du ministère",
  DISPUTED: "Contestée, en cours de vérification",
};

const ISSUER: Record<AttestationView["issuerRole"], string> = {
  PRODUCTEUR: "à la demande du producteur",
  AGENT: "par un agent du ministère",
  MINISTERE: "par le ministère",
};

export function verificationUrl(appUrl: string, code: string): string {
  return `${appUrl.replace(/\/$/, "")}/verifier/${code}`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[11rem_1fr] gap-3 border-b py-2 text-sm last:border-b-0 print:py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

export function AttestationDocument({
  attestation,
  appUrl,
}: {
  attestation: AttestationView;
  appUrl: string;
}) {
  const { snapshot } = attestation;
  const url = verificationUrl(appUrl, attestation.code);
  // SVG produit par uqr à partir de notre propre adresse et d'un code tiré de notre alphabet :
  // aucun contenu venu d'un utilisateur n'entre dans ce balisage.
  const qr = renderSVG(url, { ecc: "M", border: 1 });
  return (
    <article
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-lg border bg-card p-6 sm:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0"
      aria-label="Attestation d'exploitation agricole"
    >
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <MinistryLogo />
        <div className="text-sm sm:text-right">
          <p className="font-semibold">Attestation n° {formatAttestationCode(attestation.code)}</p>
          <p className="text-muted-foreground">Établie le {date.format(attestation.issuedAt)}</p>
        </div>
      </header>

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">
          Attestation d&apos;exploitation agricole
        </h1>
        <p className="text-sm leading-relaxed">
          Le ministère de l&apos;Agriculture, de l&apos;Élevage et de la Pêche atteste que{" "}
          <strong>{snapshot.holder.displayName}</strong> exploite, à la date de la présente
          attestation, l&apos;exploitation décrite ci-dessous, enregistrée au registre agricole
          national (BAIS).
        </p>
      </div>

      <dl className="flex flex-col">
        <Row label="Titulaire">
          {snapshot.holder.displayName}
          <span className="block text-xs font-normal text-muted-foreground">
            {snapshot.holder.identityVerified
              ? "Identité contrôlée auprès de l'ANIP (NPI)"
              : "Identité déclarée, contrôle ANIP en attente"}
          </span>
        </Row>
        <Row label="Exploitation">
          {snapshot.farm.code}
          {snapshot.farm.name ? ` (${snapshot.farm.name})` : ""}
        </Row>
        <Row label="Localisation">
          {[snapshot.farm.village, snapshot.farm.communeName].filter(Boolean).join(", ")} (
          {snapshot.farm.departementName})
        </Row>
        <Row label="Vérification">
          {VERIFICATION[snapshot.farm.verificationStatus] ?? snapshot.farm.verificationStatus}
          {snapshot.farm.verifiedAt
            ? `, le ${date.format(new Date(snapshot.farm.verifiedAt))}`
            : ""}
        </Row>
        <Row label="Parcelles">
          {snapshot.parcels}, {area.format(snapshot.declaredAreaHa)} ha déclarés
          {snapshot.measuredAreaHa !== null
            ? `, ${area.format(snapshot.measuredAreaHa)} ha mesurés sur le terrain`
            : ""}
        </Row>
        {snapshot.campaign ? (
          <Row label={`Cultures ${snapshot.campaign.code}`}>
            {snapshot.campaign.crops.length > 0
              ? snapshot.campaign.crops
                  .map((crop) => `${crop.name} ${area.format(crop.areaHa)} ha`)
                  .join(", ")
              : "Aucune culture déclarée"}
          </Row>
        ) : null}
        {snapshot.harvests.length > 0 ? (
          <Row label="Récoltes déclarées">
            <ul className="flex flex-col gap-0.5">
              {snapshot.harvests.map((harvest) => (
                <li key={`${harvest.campaignCode}-${harvest.cropName}`}>
                  {harvest.cropName}, campagne {harvest.campaignCode} :{" "}
                  <span className="tabular">{kilos.format(harvest.quantityKg)} kg</span>
                </li>
              ))}
            </ul>
          </Row>
        ) : null}
      </dl>

      <footer className="flex flex-col items-start gap-5 border-t pt-5 sm:flex-row sm:items-center">
        <div
          className="size-32 shrink-0 bg-white p-1 [&_svg]:size-full"
          role="img"
          aria-label="Code QR de vérification"
          dangerouslySetInnerHTML={{ __html: qr }}
        />
        <div className="flex flex-col gap-1.5 text-sm">
          <p className="font-semibold">Vérifier cette attestation</p>
          <p className="text-muted-foreground">
            Scannez le code, ou saisissez le numéro {formatAttestationCode(attestation.code)} sur{" "}
            <span className="font-medium text-foreground">
              {appUrl.replace(/^https?:\/\//, "")}/verifier
            </span>
            .
          </p>
          <p className="text-muted-foreground">
            Attestation établie {ISSUER[attestation.issuerRole]}. Elle décrit l&apos;exploitation à
            sa date d&apos;émission ; la page de vérification indique si elle a été retirée depuis.
          </p>
        </div>
      </footer>
    </article>
  );
}
