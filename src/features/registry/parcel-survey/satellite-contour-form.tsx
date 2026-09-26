"use client";

import { CheckCircle2, Satellite } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { estimatePolygonAreaHa } from "@/lib/geo/polygon-area";
import { getAgentDatabase } from "@/lib/offline/db";
import { useSync } from "@/lib/offline/use-sync";
import type { CandidateLevel, FieldProposalOutcome, ProposedContour } from "@/modules/satellite";
import { areaGapPercent } from "@/modules/sync/handlers/geometry";
import {
  LEVEL_COLORS,
  LEVEL_LABELS,
  confidenceLabel,
  moveVertex,
  recommendedCandidate,
  removeVertex,
} from "./satellite-contour-logic";
import { buildSatelliteContourCommand } from "./survey-command";

// MapLibre manipule window et WebGL : chargée côté client uniquement.
const SatelliteContourMap = dynamic(
  () => import("./satellite-contour-map").then((module) => module.SatelliteContourMap),
  { ssr: false, loading: () => <Skeleton className="h-[55vh] min-h-80 w-full" /> },
);

interface SatelliteContourFormProps {
  userId: string;
  farm: { id: string; location: { lng: number; lat: number } | null };
  parcel: {
    id: string;
    code: string;
    declaredAreaHa: number;
    version: number;
    centroid: { lng: number; lat: number } | null;
  };
}

type Proposal = Extract<FieldProposalOutcome, { status: "ok" }>;

const areaFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });

// Délimitation assistée (ADR-0016, phase 3) : l'agent touche l'intérieur du champ sur l'image
// satellite, BAIS propose jusqu'à trois contours ; il en choisit un, déplace les sommets à
// corriger, puis l'enregistre. La proposition demande le réseau ; l'enregistrement part par la
// file hors ligne, comme un relevé à pied.
export function SatelliteContourForm({ userId, farm, parcel }: SatelliteContourFormProps) {
  const sync = useSync(userId);
  const start = parcel.centroid ?? farm.location;
  const [point, setPoint] = useState<{ lng: number; lat: number } | null>(start);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [selected, setSelected] = useState<CandidateLevel | null>(null);
  const [ring, setRing] = useState<[number, number][] | null>(null);
  const [saved, setSaved] = useState(false);
  const [imageryMissing, setImageryMissing] = useState(false);

  function choose(candidate: ProposedContour | null) {
    setSelected(candidate?.level ?? null);
    setRing(
      candidate
        ? (candidate.geometry.coordinates[0]?.map((p) => [...p] as [number, number]) ?? null)
        : null,
    );
  }

  async function propose() {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/v1/satellite/field-proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parcelId: parcel.id,
          ...(point ? { lon: point.lng, lat: point.lat } : {}),
        }),
      });
      const body = (await response.json().catch(() => null)) as
        Proposal | { error?: string } | null;
      if (!response.ok || !body || !("candidates" in body)) {
        setProposal(null);
        choose(null);
        setError(
          (body && "error" in body && body.error) ||
            "La proposition n'a pas abouti : réessayez ou relevez le contour à pied.",
        );
        return;
      }
      setProposal(body);
      choose(recommendedCandidate(body.candidates));
    } catch {
      setError("Pas de réseau : la proposition satellite demande une connexion.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!ring) return;
    setError(null);
    const built = buildSatelliteContourCommand({
      farmId: farm.id,
      parcelId: parcel.id,
      expectedVersion: parcel.version,
      ring,
    });
    if (!built.ok) {
      setError(built.error);
      return;
    }
    await built.enqueue(getAgentDatabase(userId));
    setSaved(true);
    if (sync.online) void sync.sync();
  }

  const openRing = ring ? ring.slice(0, -1) : [];
  const areaHa =
    openRing.length >= 3
      ? estimatePolygonAreaHa(openRing.map(([lng, lat]) => ({ lng, lat })))
      : null;
  const gap = areaHa === null ? null : areaGapPercent(parcel.declaredAreaHa, areaHa);

  if (saved) {
    return (
      <Card>
        <CardHeader>
          <CheckCircle2 className="size-8 text-success" aria-hidden />
          <CardTitle>Contour enregistré</CardTitle>
          <CardDescription>
            Proposé par le satellite et validé par vous : il sera marqué « vérifié par un agent ».
            {sync.online
              ? " Il est envoyé au serveur maintenant."
              : " Il partira dès que le réseau reviendra."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="h-12">
            <Link href={`/agent/exploitations/${farm.id}` as Route}>Voir la fiche</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!start) {
    return (
      <Alert variant="watch">
        <AlertTitle>Position inconnue</AlertTitle>
        <AlertDescription>
          Ni la parcelle ni l&apos;exploitation n&apos;ont de position : relevez le contour à pied.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-24 md:pb-0">
      <Card>
        <CardHeader>
          <CardTitle>Contour de la parcelle {parcel.code} depuis le satellite</CardTitle>
          <CardDescription>
            Touchez l&apos;intérieur du champ sur l&apos;image, puis « Proposer un contour ». Les
            contours sont justes à 5 ou 10 m près : corrigez les sommets si besoin. Pour un champ de
            moins d&apos;un demi-hectare, relevez plutôt à pied.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SatelliteContourMap
            center={start}
            point={point}
            framedOn={proposal ? { lng: proposal.point.lon, lat: proposal.point.lat } : null}
            onImageryMissing={() => setImageryMissing(true)}
            candidates={proposal?.candidates ?? []}
            selected={selected}
            ring={ring}
            onPoint={setPoint}
            onMoveVertex={(index, to) =>
              setRing((current) => (current ? moveVertex(current, index, to) : current))
            }
          />
          <Button
            type="button"
            onClick={() => void propose()}
            disabled={loading || !sync.online || !point}
            aria-busy={loading}
            className="h-12 w-full"
          >
            <Satellite aria-hidden />
            {loading ? "Calcul en cours" : proposal ? "Proposer à nouveau" : "Proposer un contour"}
          </Button>
          {imageryMissing ? (
            <p className="text-sm text-muted-foreground">
              Une partie de l&apos;image satellite n&apos;a pas pu être chargée : le fond de carte
              reste visible autour. Les contours proposés, eux, sont calculés à part.
            </p>
          ) : null}
          {!sync.online ? (
            <p className="text-sm text-muted-foreground">
              Pas de réseau : la proposition satellite demande une connexion. Le relevé à pied reste
              possible.
            </p>
          ) : null}

          {error ? (
            <Alert variant="watch" role="alert">
              <AlertTitle>Pas de proposition</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {proposal ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Choisissez un contour</legend>
              <RadioGroup
                value={selected ?? undefined}
                onValueChange={(value) =>
                  choose(proposal.candidates.find((c) => c.level === value) ?? null)
                }
              >
                {proposal.candidates.map((candidate) => (
                  <div
                    key={candidate.level}
                    className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
                  >
                    <RadioGroupItem value={candidate.level} id={`contour-${candidate.level}`} />
                    <span
                      aria-hidden
                      className="h-1 w-6 shrink-0 rounded-sm"
                      style={{ background: LEVEL_COLORS[candidate.level] }}
                    />
                    <Label htmlFor={`contour-${candidate.level}`} className="flex-1 font-normal">
                      <span className="font-medium">{LEVEL_LABELS[candidate.level]}</span>
                      <span className="tabular block text-sm text-muted-foreground">
                        {areaFormatter.format(candidate.areaHa)} ha,{" "}
                        {confidenceLabel(candidate.confidence)} (
                        {percent.format(candidate.confidence)})
                        {candidate.touchesEdge ? ", déborde de l'image, à vérifier" : ""}
                      </span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              {ring ? (
                <div className="flex flex-col gap-2 text-sm">
                  <p className="tabular text-muted-foreground">
                    {areaHa === null
                      ? "Surface du contour non calculée."
                      : `Surface du contour : ${areaFormatter.format(areaHa)} ha sur ${areaFormatter.format(parcel.declaredAreaHa)} ha déclarés${gap !== null ? ` (écart de ${gap} %)` : ""}.`}{" "}
                    Faites glisser un sommet pour le corriger.
                  </p>
                  {openRing.length > 3 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="self-start"
                      onClick={() =>
                        setRing((current) =>
                          current ? removeVertex(current, current.length - 2) : current,
                        )
                      }
                    >
                      Retirer le dernier sommet
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {proposal.sourceId === "COPERNICUS_S2"
                  ? `Copernicus Sentinel-2, passages du ${new Date(proposal.window.from).toLocaleDateString("fr-FR")} au ${new Date(proposal.window.to).toLocaleDateString("fr-FR")}, ${proposal.attribution}`
                  : "Contours de démonstration (image synthétique)"}
              </p>
            </fieldset>
          ) : null}
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t bg-background/95 p-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto flex max-w-6xl gap-2">
          <Button asChild variant="outline" className="h-12">
            <Link href={`/agent/exploitations/${farm.id}` as Route}>Annuler</Link>
          </Button>
          <Button className="h-12 flex-1" disabled={!ring} onClick={() => void save()}>
            Valider ce contour
          </Button>
        </div>
      </div>
    </div>
  );
}
