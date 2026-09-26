import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiActor } from "@/features/auth/api-actor";
import { clientAddress } from "@/lib/client-address";
import { isValidTile } from "@/lib/geo/tile-math";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  getDetailTile,
  getOverviewImage,
  isOfferedPeriod,
  type ImageryOutcome,
} from "@/modules/satellite";

export const dynamic = "force-dynamic";

// Images de la vue du ciel (ADR-0016), calculées par Copernicus et gardées en cache :
// - /api/satellite/{couche}/{AAAA-MM|60-jours}/overview.png : image d'ensemble du pays, publique ;
// - /api/satellite/{couche}/{AAAA-MM|60-jours}/{z}/{x}/{y}.png : tuile de 512 px, réservée aux
//   comptes connectés, pour qu'un robot anonyme ne vide pas le quota mensuel du compte CDSE.

const LAYERS = { "couleur-naturelle": "TRUE_COLOR", ndvi: "NDVI" } as const;

// Image d'ensemble publique : 60 demandes par adresse et par tranche de 5 minutes, bien au-delà
// d'une navigation normale (24 images au plus, gardées ensuite par le navigateur).
const OVERVIEW_RATE_LIMIT = { windowSeconds: 300, max: 60 };
// Tuiles détaillées, par compte : une tuile absente du cache consomme une unité du quota mensuel
// du compte CDSE, partagé par tout le pays. Plafonds larges pour un usage réel (la copie du
// navigateur se revalide), assez bas pour qu'un seul compte ne vide pas le quota en une journée.
const TILE_RATE_LIMITS = [
  { windowSeconds: 3600, max: 1000 },
  { windowSeconds: 86_400, max: 3000 },
] as const;

const tileSchema = z.tuple([
  z.coerce.number().int().min(0).max(22),
  z.coerce.number().int().min(0),
  z.coerce.number().int().min(0),
]);

interface ImageParams {
  layer: string;
  period: string;
  tile: string[];
}

function respond(outcome: ImageryOutcome, visibility: "public" | "private"): NextResponse {
  switch (outcome.status) {
    case "ok":
      return new NextResponse(new Uint8Array(outcome.image), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          // Un mois révolu ne change plus ; le mois en cours se rafraîchit.
          "Cache-Control": outcome.permanent
            ? `${visibility}, max-age=604800, immutable`
            : `${visibility}, max-age=3600`,
        },
      });
    case "empty":
      return new NextResponse(null, {
        status: 204,
        headers: { "Cache-Control": `${visibility}, max-age=3600` },
      });
    case "period-not-offered":
      return NextResponse.json({ error: "Mois hors de la période proposée" }, { status: 400 });
    case "not-configured":
      return NextResponse.json({ error: "Imagerie satellite non configurée" }, { status: 503 });
    case "budget-exhausted":
      return NextResponse.json(
        { error: "Quota mensuel d'imagerie atteint, réessayez le mois prochain" },
        { status: 429 },
      );
    case "unavailable":
      return NextResponse.json({ error: "Copernicus momentanément injoignable" }, { status: 502 });
  }
}

export async function GET(request: NextRequest, context: { params: Promise<ImageParams> }) {
  const { layer: layerSlug, period, tile } = await context.params;
  // Clé propre de la table seulement : « constructor » ou « __proto__ » ne sont pas des couches.
  const layer = Object.hasOwn(LAYERS, layerSlug)
    ? LAYERS[layerSlug as keyof typeof LAYERS]
    : undefined;
  // Les douze mois proposés et la fenêtre glissante des 60 derniers jours, rien d'autre.
  if (!layer || !isOfferedPeriod(period, new Date())) {
    return NextResponse.json({ error: "Couche ou période invalide" }, { status: 400 });
  }
  if (tile.length === 1 && tile[0] === "overview.png") {
    // Sans relais de confiance, l'adresse est inconnue : pas de compteur commun à tous les
    // visiteurs, qu'un seul script bloquerait pour le pays entier. Le coût reste borné : 26 images
    // au plus, gardées en base, que les demandes répétées ne font pas recalculer.
    const address = clientAddress(request.headers);
    if (
      address &&
      !(await consumeRateLimit(`satellite-overview:${address}`, OVERVIEW_RATE_LIMIT))
    ) {
      return NextResponse.json(
        { error: "Trop de demandes, réessayez dans quelques minutes" },
        { status: 429, headers: { "Retry-After": String(OVERVIEW_RATE_LIMIT.windowSeconds) } },
      );
    }
    return respond(await getOverviewImage(layer, period), "public");
  }
  const parsed = tileSchema.safeParse([tile[0], tile[1], tile[2]?.replace(/\.png$/, "")]);
  if (tile.length !== 3 || !parsed.success || !isValidTile(...parsed.data)) {
    return NextResponse.json({ error: "Tuile invalide" }, { status: 400 });
  }
  const api = await getApiActor(request.headers);
  if (!api) {
    return NextResponse.json(
      { error: "Connexion requise pour l'image détaillée" },
      { status: 401 },
    );
  }
  for (const [index, rule] of TILE_RATE_LIMITS.entries()) {
    if (!(await consumeRateLimit(`satellite-tile-${index}:${api.userId}`, rule))) {
      return NextResponse.json(
        { error: "Trop d'images détaillées demandées, réessayez plus tard" },
        { status: 429, headers: { "Retry-After": String(rule.windowSeconds) } },
      );
    }
  }
  const [z, x, y] = parsed.data;
  return respond(await getDetailTile(layer, period, z, x, y), "private");
}
