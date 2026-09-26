"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { LandPlot } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { getAgentDatabase } from "@/lib/offline/db";
import { buildFieldAttributionCommand } from "./survey-command";

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

interface Contour {
  geometry: { type: "Polygon"; coordinates: [number, number][][] };
  areaHa: number;
}

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; contours: Contour[] };

// Un seul geste : l'agent touche un champ détecté (ou plusieurs voisins), puis tape directement
// l'exploitation dans cette liste pour l'attribuer, pas d'écran de confirmation séparé. La
// recherche filtre les exploitations de son périmètre, les plus récentes d'abord (ADR-0029).
export function FieldAttributionSheet({
  userId,
  fieldIds,
  cut = null,
  onClose,
  onAttributed,
}: {
  userId: string;
  fieldIds: string[] | null;
  /** Ligne de coupe (deux points lng, lat) : le champ se divise en deux parts à attribuer. */
  cut?: ReadonlyArray<readonly [number, number]> | null;
  onClose: () => void;
  onAttributed: (farmId: string) => void;
}) {
  const cutQuery = cut && cut.length === 2 ? cut.flat().join(",") : null;
  const key = fieldIds ? `${fieldIds.join(",")}${cutQuery ? `|${cutQuery}` : ""}` : null;
  // Tant que la réponse n'est pas encore arrivée pour ce jeu de champs, l'écran affiche le
  // chargement : dérivé au rendu, jamais posé directement dans l'effet.
  const [loaded, setLoaded] = useState<{ key: string; state: Load } | null>(null);
  const load: Load = loaded?.key === key ? loaded.state : { status: "loading" };
  const [query, setQuery] = useState("");
  // Parts déjà attribuées d'un champ divisé, pour ce jeu de champs seulement.
  const [progress, setProgress] = useState<{ key: string; done: number } | null>(null);
  const done = progress?.key === key ? progress.done : 0;
  const open = fieldIds !== null;

  useEffect(() => {
    if (!fieldIds || !key) return;
    const controller = new AbortController();
    fetch(
      `/api/v1/registry/reference-fields?ids=${fieldIds.join(",")}${cutQuery ? `&cut=${cutQuery}` : ""}`,
      {
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        if (response.status === 404) {
          return setLoaded({
            key,
            state: { status: "error", message: "Ce champ n'est plus disponible." },
          });
        }
        if (response.status === 422) {
          return setLoaded({
            key,
            state: {
              status: "error",
              message: cutQuery
                ? "Cette ligne ne coupe pas le champ en deux parts utiles : recommencez."
                : "Ces champs ne se touchent pas : choisissez des champs voisins.",
            },
          });
        }
        if (!response.ok) {
          return setLoaded({ key, state: { status: "error", message: "Chargement impossible." } });
        }
        const body = (await response.json()) as { contour?: Contour; parts?: Contour[] };
        const contours = body.parts ?? (body.contour ? [body.contour] : []);
        setLoaded({ key, state: { status: "ready", contours } });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoaded({ key, state: { status: "error", message: "Chargement impossible." } });
        }
      });
    return () => controller.abort();
  }, [fieldIds, key, cutQuery]);

  const db = getAgentDatabase(userId);
  const matches = useLiveQuery(
    async () => {
      const farms = await db.farms.orderBy("updatedAt").reverse().limit(200).toArray();
      const needle = normalize(query.trim());
      return farms.filter(
        (farm) =>
          !needle ||
          normalize(farm.farmerName).includes(needle) ||
          farm.code.toLowerCase().includes(needle),
      );
    },
    [db, query],
    [],
  );

  async function attribute(farmId: string) {
    if (load.status !== "ready" || !key) return;
    const contour = load.contours[done];
    if (!contour) return;
    const built = buildFieldAttributionCommand({
      farmId,
      parcelId: crypto.randomUUID(),
      referenceFieldIds: fieldIds ?? [],
      geometry: contour.geometry,
      declaredAreaHa: contour.areaHa,
    });
    if (!built.ok) return;
    await built.enqueue(db);
    if (done + 1 < load.contours.length) {
      setProgress({ key, done: done + 1 });
      setQuery("");
      return;
    }
    onAttributed(farmId);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setQuery("");
          onClose();
        }
      }}
    >
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-xl">
        <SheetHeader className="px-0">
          <SheetTitle>{cutQuery ? "Attribuer une part du champ" : "Attribuer ce champ"}</SheetTitle>
          <SheetDescription>
            {load.status === "ready" && load.contours[done]
              ? `${cutQuery ? `Part ${done + 1} sur ${load.contours.length}, environ` : "Environ"} ${load.contours[done].areaHa.toFixed(2)} ha. Touchez une exploitation pour l'attribuer.`
              : "Recherchez l'exploitation à qui attribuer ce champ."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-4">
          {load.status === "loading" ? <Skeleton className="h-12 w-full" /> : null}
          {load.status === "error" ? (
            <Alert variant="critical">
              <AlertTitle>Champ indisponible</AlertTitle>
              <AlertDescription>
                <p>{load.message}</p>
              </AlertDescription>
            </Alert>
          ) : null}
          <Input
            type="search"
            autoComplete="off"
            placeholder="Nom du producteur ou code"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={load.status !== "ready"}
          />
          <ul className="flex flex-col gap-2" aria-label="Exploitations de votre périmètre">
            {matches.map((farm) => (
              <li key={farm.id}>
                <button
                  type="button"
                  disabled={load.status !== "ready"}
                  onClick={() => void attribute(farm.id)}
                  className="flex min-h-16 w-full items-center gap-3 rounded-lg border bg-card px-4 text-left hover:bg-accent/60 disabled:pointer-events-none disabled:opacity-50"
                >
                  <LandPlot aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium break-words">{farm.farmerName}</span>
                    <span className="block text-sm break-words text-muted-foreground">
                      <span className="font-mono text-xs">{farm.code}</span> ({farm.communeName})
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {matches.length === 0 ? (
              <li className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Aucune exploitation trouvée.
              </li>
            ) : null}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
