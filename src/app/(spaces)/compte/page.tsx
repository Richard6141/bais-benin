import { headers } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";
import { ReliabilityBadge, type Reliability } from "@/components/data-display/reliability-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NpiForm } from "@/features/account/npi-form";
import { SessionsList } from "@/features/account/sessions-list";
import { requireUser } from "@/features/auth/session";
import { auth } from "@/lib/auth/auth";
import { formatNational } from "@/lib/auth/phone";
import { getServerEnv } from "@/lib/env";
import { npiSummary } from "@/modules/identity";

export const metadata: Metadata = { title: "Mon compte" };

const NPI_STATUS_LABEL: Record<string, { label: string; reliability: Reliability }> = {
  PENDING: { label: "En attente de vérification ANIP", reliability: "DECLARED" },
  VERIFIED: { label: "Vérifié par l'ANIP", reliability: "OFFICIAL" },
  MISMATCH: { label: "Vérification en échec", reliability: "DECLARED" },
};

export default async function AccountPage() {
  const user = await requireUser({ returnTo: "/compte" });
  const env = getServerEnv();
  const [npi, sessions] = await Promise.all([
    npiSummary(user.id),
    auth.api.listSessions({ headers: await headers() }),
  ]);
  const isPhoneAccount = user.email.endsWith("@telephone.bais.invalid");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Mon compte"
        title={user.name}
        description="Votre identité, votre sécurité et vos appareils connectés."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Identité</CardTitle>
            <CardDescription>Les informations qui servent à vous reconnaître.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <Row
              label="Téléphone"
              value={user.phoneNumber ? `+229 ${formatNational(user.phoneNumber.slice(4))}` : "—"}
            />
            <Row
              label="E-mail"
              value={isPhoneAccount ? "Aucun (compte par téléphone)" : user.email}
            />
            <Row
              label="Rôles"
              value={
                <span className="flex flex-wrap gap-1">
                  {user.actor.grants.map((grant, index) => (
                    <Badge key={index} variant="secondary">
                      {grant.role}
                    </Badge>
                  ))}
                </span>
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sécurité</CardTitle>
            <CardDescription>Double authentification et appareils connectés.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <Row
              label="Double authentification"
              value={
                user.twoFactorEnabled ? (
                  <Badge variant="success">Active</Badge>
                ) : (
                  <Badge variant="watch">Inactive</Badge>
                )
              }
            />
            {!isPhoneAccount && !user.twoFactorEnabled ? (
              <Button asChild variant="outline" className="sm:self-start">
                <Link href="/compte/securite">Activer la double authentification</Link>
              </Button>
            ) : null}
            <SessionsList
              sessions={sessions.map((session) => ({
                id: session.id,
                token: session.token,
                current: session.id === user.session.id,
                createdAt: new Date(session.createdAt).toISOString(),
                expiresAt: new Date(session.expiresAt).toISOString(),
                userAgent: session.userAgent ?? null,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Numéro personnel d&apos;identification (NPI)</CardTitle>
          <CardDescription>
            Facultatif. Il relie votre compte à votre identité nationale ANIP et renforce la
            confiance dans vos déclarations. Il est chiffré et jamais affiché en clair.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {npi.status !== "NONE" ? (
            <div className="flex flex-col gap-3 text-sm">
              <Row label="NPI" value={<code className="tabular font-mono">{npi.masked}</code>} />
              <Row
                label="Statut"
                value={
                  <span className="flex items-center gap-2">
                    <ReliabilityBadge
                      level={NPI_STATUS_LABEL[npi.status]?.reliability ?? "DECLARED"}
                      showLabel={false}
                    />
                    {NPI_STATUS_LABEL[npi.status]?.label ?? npi.status}
                  </span>
                }
              />
            </div>
          ) : (
            <NpiForm expectedLength={env.NPI_LENGTH} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
