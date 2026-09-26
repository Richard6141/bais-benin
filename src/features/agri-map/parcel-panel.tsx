"use client";

import type { Route } from "next";
import Link from "next/link";
import { AlertTriangle, Phone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { HelpTip } from "@/components/forms/help-tip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CAPTURE_METHOD_LABELS,
  CROP_STAGE_LABELS,
  VERIFICATION_STATUS_LABELS,
  VERIFICATION_STATUS_VARIANTS,
  formatDate,
  formatHa,
} from "@/features/registry/agent/labels";
import { REPORT_STATUS_LABELS, REPORT_TYPE_LABELS } from "@/features/reports/labels";
import {
  VEGETATION_STATUS_LABELS,
  VEGETATION_STATUS_VARIANTS,
  formatNdvi,
  reasonLabel,
  vegetationSourceLabel,
} from "@/features/satellite/vegetation-labels";
import type { ParcelInspection, ParcelInspectionCrop } from "@/modules/registry";
import { NdviSparkline } from "./ndvi-sparkline";

// Fiche d'une parcelle cliquée sur la carte : qui la cultive, ce qui y pousse, le rendement face
// aux voisins de la commune et ce que le satellite en voit. Les données arrivent en JSON : les
// dates y sont des chaînes.

type Inspection = Omit<ParcelInspection, "vegetation" | "reports" | "crops"> & {
  crops: Array<Omit<ParcelInspectionCrop, "sowingDate"> & { sowingDate: string | null }>;
  vegetation:
    | (Omit<NonNullable<ParcelInspection["vegetation"]>, "computedAt"> & { computedAt: string })
    | null;
  reports: Array<Omit<ParcelInspection["reports"][number], "observedAt"> & { observedAt: string }>;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; parcel: Inspection };

interface ParcelPanelProps {
  parcelId: string;
  onClose: () => void;
  /** Emprise de la parcelle chargée, pour cadrer la carte quand la fiche vient d'un lien. */
  onLoaded?: (bbox: [number, number, number, number] | null) => void;
  /** Lien vers la fiche complète de l'exploitation, quand l'espace en a une (agent). */
  farmHref?: (farmId: string) => string;
}

const IRRIGATION_LABELS: Record<string, string> = {
  NONE: "Pluviale",
  MANUAL: "Arrosage manuel",
  DRIP: "Goutte-à-goutte",
  FLOOD: "Submersion",
};

const tonnes = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const kilos = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });

export function ParcelPanel({ parcelId, onClose, onLoaded, farmHref }: ParcelPanelProps) {
  // La fiche chargée garde l'identifiant de sa parcelle : tant qu'elle ne correspond pas à la
  // parcelle demandée, le panneau affiche le chargement.
  const [loaded, setLoaded] = useState<{ id: string; state: LoadState } | null>(null);
  const state: LoadState = loaded?.id === parcelId ? loaded.state : { status: "loading" };

  useEffect(() => {
    const controller = new AbortController();
    const fail = (message: string) =>
      setLoaded({ id: parcelId, state: { status: "error", message } });
    fetch(`/api/v1/registry/parcels/${parcelId}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) return fail("Cette parcelle n'est pas dans votre périmètre.");
        if (!response.ok) return fail("La fiche n'a pas pu être chargée.");
        const parcel = (await response.json()) as Inspection;
        setLoaded({ id: parcelId, state: { status: "ready", parcel } });
        onLoaded?.(parcel.bbox);
      })
      .catch(() => {
        if (!controller.signal.aborted) fail("La fiche n'a pas pu être chargée.");
      });
    return () => controller.abort();
    // onLoaded n'est lu qu'à l'arrivée de la fiche : le changer ne recharge rien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcelId]);

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Parcelle
          </p>
          <h2 className="tabular text-lg font-semibold break-words">
            {state.status === "ready" ? state.parcel.code : "Chargement"}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          onClick={onClose}
          aria-label="Fermer la fiche de la parcelle"
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>

      {state.status === "loading" ? <PanelSkeleton /> : null}
      {state.status === "error" ? (
        <p className="rounded-sm border bg-muted/40 p-3 text-sm">{state.message}</p>
      ) : null}
      {state.status === "ready" ? <ParcelDetail parcel={state.parcel} farmHref={farmHref} /> : null}
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

function ParcelDetail({
  parcel,
  farmHref,
}: {
  parcel: Inspection;
  farmHref?: (farmId: string) => string;
}) {
  const current = parcel.crops.filter((crop) => crop.campaignOpen);
  const past = parcel.crops.filter((crop) => !crop.campaignOpen && crop.harvestKg !== null);
  return (
    <>
      <section aria-label="Producteur" className="flex flex-col gap-1.5">
        <p className="text-base font-medium">{parcel.farmer.displayName}</p>
        <p className="tabular text-sm text-muted-foreground">Producteur {parcel.farmer.code}</p>
        <p className="text-sm">
          Exploitation <span className="tabular">{parcel.farm.code}</span>
          {parcel.farm.name ? ` (${parcel.farm.name})` : ""}
        </p>
        <p className="text-sm text-muted-foreground">
          {[parcel.farm.village, parcel.farm.communeName].filter(Boolean).join(", ")} (
          {parcel.farm.departementName})
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge variant={VERIFICATION_STATUS_VARIANTS[parcel.farm.verificationStatus]}>
            {VERIFICATION_STATUS_LABELS[parcel.farm.verificationStatus]}
          </Badge>
          {parcel.farmer.phone ? (
            <a
              href={`tel:${parcel.farmer.phone}`}
              className="tabular inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              <Phone className="size-3.5" aria-hidden />
              {parcel.farmer.phone}
            </a>
          ) : null}
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border bg-card p-3 text-sm">
        <Figure label="Superficie déclarée" value={formatHa(parcel.declaredAreaHa)} />
        <Figure
          label="Superficie mesurée"
          value={formatHa(parcel.computedAreaHa)}
          help="Calculée sur le contour relevé (marche GPS, dessin ou proposition satellite validée)."
        />
        <Figure
          label="Contour"
          value={CAPTURE_METHOD_LABELS[parcel.captureMethod] ?? "Non renseigné"}
        />
        <Figure label="Eau" value={IRRIGATION_LABELS[parcel.irrigation] ?? "Non renseignée"} />
      </dl>

      {parcel.overlaps.length > 0 ? (
        <p className="flex gap-2 rounded-md border border-laterite/40 bg-laterite-soft p-3 text-sm text-laterite">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Ce contour recouvre{" "}
            {parcel.overlaps.length === 1
              ? "une autre parcelle"
              : `${parcel.overlaps.length} autres parcelles`}
            {parcel.overlaps[0]?.otherParcelCode ? ` (${parcel.overlaps[0].otherParcelCode})` : ""}.
            Doublon, erreur de relevé ou conflit foncier : à vérifier sur place.
          </span>
        </p>
      ) : null}

      <section aria-labelledby="parcelle-cultures">
        <h3 id="parcelle-cultures" className="text-sm font-semibold">
          Campagne en cours
        </h3>
        {current.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Aucune culture déclarée.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {current.map((crop) => (
              <CropRow
                key={`${crop.campaignCode}-${crop.cropCode}-${crop.subSeason}`}
                crop={crop}
              />
            ))}
          </ul>
        )}
      </section>

      {parcel.vegetation ? <SatelliteBlock vegetation={parcel.vegetation} /> : null}

      {past.length > 0 ? (
        <section aria-labelledby="parcelle-rendements">
          <div className="flex items-center gap-1.5">
            <h3 id="parcelle-rendements" className="text-sm font-semibold">
              Rendements des campagnes passées
            </h3>
            <HelpTip label="Rendements">
              Récolte déclarée rapportée à la surface semée, comparée aux autres parcelles de la
              même commune pour la même culture et la même campagne. La comparaison n&apos;apparaît
              qu&apos;à partir de 5 parcelles comparables.
            </HelpTip>
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {past.map((crop) => (
              <CropRow
                key={`${crop.campaignCode}-${crop.cropCode}-${crop.subSeason}`}
                crop={crop}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {parcel.reports.length > 0 ? (
        <section aria-labelledby="parcelle-signalements">
          <h3 id="parcelle-signalements" className="text-sm font-semibold">
            Signalements
          </h3>
          <ul className="mt-2 flex flex-col divide-y rounded-lg border text-sm">
            {parcel.reports.map((report) => (
              <li key={report.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span>
                  {REPORT_TYPE_LABELS[report.type as keyof typeof REPORT_TYPE_LABELS]?.label ??
                    report.type}
                  <span className="block text-xs text-muted-foreground">
                    {formatDate(report.observedAt)}
                  </span>
                </span>
                <Badge
                  variant={
                    REPORT_STATUS_LABELS[report.status as keyof typeof REPORT_STATUS_LABELS]
                      ?.tone ?? "info"
                  }
                >
                  {REPORT_STATUS_LABELS[report.status as keyof typeof REPORT_STATUS_LABELS]
                    ?.label ?? report.status}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {farmHref ? (
        <Button asChild variant="outline" className="h-11">
          <Link href={farmHref(parcel.farm.id) as Route}>
            Ouvrir la fiche de l&apos;exploitation
          </Link>
        </Button>
      ) : null}
    </>
  );
}

function CropRow({ crop }: { crop: Inspection["crops"][number] }) {
  return (
    <li className="rounded-lg border bg-card p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 font-medium">
          <span
            aria-hidden
            className="inline-block size-3 shrink-0 rounded-sm border border-black/10"
            style={{ backgroundColor: crop.colorHex ?? "#9aa3ad" }}
          />
          <span className="break-words">{crop.cropName}</span>
        </span>
        <span className="tabular shrink-0 text-muted-foreground">{formatHa(crop.areaHa)}</span>
      </div>
      <p className="mt-1 text-muted-foreground">
        {crop.campaignOpen
          ? `${CROP_STAGE_LABELS[crop.stage] ?? crop.stage}${crop.sowingDate ? `, semée le ${formatDate(crop.sowingDate)}` : ""}`
          : `Campagne ${crop.campaignCode}`}
      </p>
      {crop.yieldTPerHa !== null ? <YieldLine crop={crop} /> : null}
    </li>
  );
}

function YieldLine({ crop }: { crop: Inspection["crops"][number] }) {
  const share = crop.betterThanShare;
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <p>
        <span className="tabular font-semibold">{tonnes.format(crop.yieldTPerHa ?? 0)} t/ha</span>
        <span className="text-muted-foreground">
          {" "}
          ({kilos.format(crop.harvestKg ?? 0)} kg récoltés)
        </span>
      </p>
      {crop.communeMedianTPerHa !== null && share !== null ? (
        <>
          <div
            className="relative h-1.5 overflow-hidden rounded-sm bg-muted"
            role="img"
            aria-label={`Meilleur rendement que ${percent.format(share)} des parcelles comparables`}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-sm bg-forest"
              style={{ width: `${Math.round(share * 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Mieux que {percent.format(share)} des {crop.peers} parcelles de la commune, médiane{" "}
            <span className="tabular">{tonnes.format(crop.communeMedianTPerHa)} t/ha</span>
          </p>
        </>
      ) : null}
    </div>
  );
}

function SatelliteBlock({ vegetation }: { vegetation: NonNullable<Inspection["vegetation"]> }) {
  const reason = reasonLabel(vegetation.reason);
  return (
    <section aria-labelledby="parcelle-satellite" className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <h3 id="parcelle-satellite" className="text-sm font-semibold">
          Vue du satellite
        </h3>
        <HelpTip label="Vue du satellite">
          Indice de végétation (NDVI) mesuré par Sentinel-2 tous les dix jours sur le contour de la
          parcelle, comparé au niveau que la culture déclarée doit atteindre. « À vérifier » demande
          une visite, ce n&apos;est jamais une sanction.
        </HelpTip>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={VEGETATION_STATUS_VARIANTS[vegetation.status]}>
          {VEGETATION_STATUS_LABELS[vegetation.status]}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {vegetation.cropName}, campagne {vegetation.campaignCode}
        </span>
      </div>
      {reason ? <p className="text-sm">{reason}</p> : null}
      <NdviSparkline series={vegetation.series} expected={vegetation.expectedNdvi} />
      <p className="text-sm">
        NDVI maximal <span className="tabular font-medium">{formatNdvi(vegetation.peakNdvi)}</span>,
        attendu au moins <span className="tabular">{formatNdvi(vegetation.expectedNdvi)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        {vegetation.sensor === "S1"
          ? "Radar Sentinel-1 (les nuages ont caché la saison)"
          : vegetationSourceLabel(vegetation.sourceId)}
        , calcul du {formatDate(vegetation.computedAt)}
      </p>
    </section>
  );
}

function Figure({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {help ? <HelpTip label={label}>{help}</HelpTip> : null}
      </dt>
      <dd className="tabular mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
