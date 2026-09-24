import { ClipboardCheck, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { CropGlyph, CROP_CODES, type CropCode } from "@/components/data-display/crop-glyph";
import { ReliabilityBadge, type Reliability } from "@/components/data-display/reliability-badge";
import { SourceCaption } from "@/components/data-display/source-caption";
import { StatTile } from "@/components/data-display/stat-tile";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FarmDetail } from "@/modules/registry";
import { EventTimeline, summarizeEvent } from "./event-timeline";
import { FarmOutbox } from "./farm-outbox";
import { CAPTURE_METHOD_LABELS, TENURE_LABELS, formatDate, formatHa } from "./labels";
import { VerificationStatusBadge } from "./status-badge";

interface FarmDetailViewProps {
  farm: FarmDetail;
  userId: string;
}

const RELIABILITY_BY_STATUS: Record<string, Reliability> = {
  DECLARED: "DECLARED",
  AGENT_VERIFIED: "AGENT_VERIFIED",
  FIELD_VERIFIED: "FIELD_VERIFIED",
  DISPUTED: "DECLARED",
};

// Fiche exploitation côté agent : résumé, parcelles, historique, activité de synchronisation.
export function FarmDetailView({ farm, userId }: FarmDetailViewProps) {
  const reliability = RELIABILITY_BY_STATUS[farm.verificationStatus] ?? "DECLARED";
  const cropCodes = farm.cropCodes.filter((code): code is CropCode =>
    (CROP_CODES as readonly string[]).includes(code),
  );
  const currentCrops = farm.parcels.flatMap((parcel) =>
    parcel.crops.map((crop) => ({ ...crop, parcelCode: parcel.code })),
  );
  const events = farm.events.map((event) => ({
    id: event.id,
    kind: event.kind,
    occurredAt: event.occurredAt.toISOString(),
    summary: summarizeEvent(event.kind, event.payload),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Exploitation</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {farm.farmer.displayName}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="font-mono">{farm.code}</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              {farm.commune.name}
              {farm.village ? `, ${farm.village}` : ""}
            </span>
            {farm.farmer.phone ? (
              <a
                href={`tel:${farm.farmer.phone}`}
                className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
              >
                <Phone className="size-3.5" aria-hidden />
                {farm.farmer.phone}
              </a>
            ) : null}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <VerificationStatusBadge status={farm.verificationStatus} />
            <ReliabilityBadge level={reliability} />
          </div>
        </div>
        {farm.verificationStatus === "DECLARED" || farm.verificationStatus === "DISPUTED" ? (
          <Button asChild className="h-12">
            <Link href={`/agent/verification/${farm.id}` as Route}>
              <ClipboardCheck aria-hidden />
              Vérifier sur place
            </Link>
          </Button>
        ) : null}
      </div>

      <Tabs defaultValue="resume">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="resume">Résumé</TabsTrigger>
          <TabsTrigger value="parcelles">Parcelles ({farm.parcels.length})</TabsTrigger>
          <TabsTrigger value="historique">Historique</TabsTrigger>
          <TabsTrigger value="activite">Activité</TabsTrigger>
        </TabsList>

        <TabsContent value="resume" className="flex flex-col gap-6 pt-4">
          <section className="grid gap-4 sm:grid-cols-3">
            <StatTile
              label="Superficie déclarée"
              value={formatHa(farm.declaredAreaHa)}
              source="Déclaration du producteur"
              reliability="DECLARED"
            />
            <StatTile
              label="Superficie mesurée"
              value={farm.computedAreaHa === null ? "—" : formatHa(farm.computedAreaHa)}
              source={farm.computedAreaHa === null ? "Aucun relevé" : "Relevé des parcelles"}
              reliability={farm.computedAreaHa === null ? undefined : "FIELD_VERIFIED"}
            />
            <StatTile label="Parcelles" value={farm.parcelCount} source="Registre national" />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Cultures de la campagne</CardTitle>
            </CardHeader>
            <CardContent>
              {cropCodes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune culture déclarée.</p>
              ) : (
                <ul className="flex flex-wrap gap-4">
                  {cropCodes.map((code) => (
                    <li key={code} className="flex flex-col items-center gap-1 text-xs">
                      <CropGlyph code={code} size={48} />
                      <span className="sr-only">{code}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Caractéristiques</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                <Item label="Faire-valoir" value={TENURE_LABELS[farm.tenure] ?? farm.tenure} />
                <Item label="Activité principale" value={farm.mainActivity} />
                <Item
                  label="Producteur"
                  value={`${farm.farmer.displayName} · ${farm.farmer.code}`}
                />
                <Item
                  label="Position du siège"
                  value={
                    farm.location
                      ? `${farm.location.lat.toFixed(5)}, ${farm.location.lng.toFixed(5)}`
                      : "—"
                  }
                />
                <Item
                  label="Dernière visite"
                  value={farm.verifiedAt ? formatDate(farm.verifiedAt) : "Aucune"}
                />
                <Item label="Version" value={String(farm.version)} />
              </dl>
              <SourceCaption
                className="mt-4"
                source={farm.provenance.sourceId}
                date={formatDate(farm.provenance.sourceDate)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="parcelles" className="pt-4">
          {farm.parcels.length === 0 ? (
            <EmptyState
              title="Aucune parcelle"
              description="Le relevé de contour se fait lors de la visite de vérification."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {farm.parcels.map((parcel) => (
                <li key={parcel.id}>
                  <Card className="flex flex-col gap-2 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold">{parcel.code}</span>
                      <span className="text-xs text-muted-foreground">
                        {CAPTURE_METHOD_LABELS[parcel.captureMethod] ?? parcel.captureMethod}
                      </span>
                    </div>
                    <p className="tabular text-sm">
                      {formatHa(parcel.declaredAreaHa)} déclarés
                      {parcel.computedAreaHa !== null
                        ? ` · ${formatHa(parcel.computedAreaHa)} mesurés`
                        : ""}
                    </p>
                    {parcel.crops.length > 0 ? (
                      <ul className="flex flex-wrap gap-2 text-sm">
                        {parcel.crops.map((crop) => (
                          <li key={crop.id} className="rounded-md bg-muted px-2 py-1">
                            {crop.cropName} · {crop.campaignCode}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="historique" className="flex flex-col gap-6 pt-4">
          {currentCrops.some((c) => c.declarations.length > 0) ? (
            <Card>
              <CardHeader>
                <CardTitle>Récoltes déclarées</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2 text-sm">
                  {currentCrops.flatMap((crop) =>
                    crop.declarations.map((d) => (
                      <li
                        key={d.id}
                        className="flex flex-wrap justify-between gap-2 border-b pb-2 last:border-0"
                      >
                        <span>
                          {crop.cropName} · {crop.parcelCode} · {crop.campaignCode}
                        </span>
                        <span className="tabular">
                          {d.declaredQuantity} {d.unit} ≈ {Math.round(d.quantityKg)} kg ·{" "}
                          {formatDate(d.declaredOn)}
                        </span>
                      </li>
                    )),
                  )}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          <EventTimeline events={events} />
        </TabsContent>

        <TabsContent value="activite" className="pt-4">
          <FarmOutbox userId={userId} farmId={farm.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
