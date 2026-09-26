import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiActor } from "@/features/auth/api-actor";
import { PROPOSALS_PER_DAY, proposeFieldContours } from "@/modules/satellite";
import { getRemoteSensingProvider } from "@/services/remote-sensing";

export const dynamic = "force-dynamic";

// Propositions de contours de champ depuis l'image Sentinel-2 (ADR-0016, phase 3), pour une
// parcelle que l'agent peut modifier. Une requête Copernicus par proposition, dans la part du
// quota réservée aux propositions ; les messages disent à l'agent quoi faire ensuite.

const bodySchema = z
  .object({
    parcelId: z.uuid(),
    lon: z.number().min(-180).max(180).optional(),
    lat: z.number().min(-90).max(90).optional(),
  })
  .refine((body) => (body.lon === undefined) === (body.lat === undefined), {
    message: "lon et lat vont ensemble",
  });

const ERRORS = {
  "not-found": [404, "Parcelle introuvable dans vos exploitations"],
  "point-too-far": [422, "Touchez un point à moins de 2 km de la parcelle, au Bénin"],
  "rate-limited": [
    429,
    `Limite de ${PROPOSALS_PER_DAY} propositions par jour atteinte : relevez le contour à pied ou réessayez demain`,
  ],
  "share-exhausted": [
    429,
    "La part mensuelle des propositions satellite est épuisée : relevez le contour à pied, les propositions reviennent le mois prochain",
  ],
  "not-configured": [503, "Propositions satellite pas encore disponibles"],
  unavailable: [502, "Copernicus ne répond pas : réessayez dans quelques minutes"],
  clouded: [422, "Ce point est resté sous les nuages : touchez un autre endroit du champ"],
  "too-small": [422, "Champ trop petit pour le satellite (moins de 0,5 ha) : relevez-le à pied"],
  "no-field": [
    422,
    "Aucun champ distinct autour de ce point : touchez l'intérieur du champ ou relevez-le à pied",
  ],
} as const;

export async function POST(request: NextRequest) {
  const api = await getApiActor(request.headers);
  if (!api) return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Parcelle et point attendus" }, { status: 400 });
  }
  const outcome = await proposeFieldContours(api.actor, parsed.data, getRemoteSensingProvider());
  if (outcome.status === "ok") {
    return NextResponse.json(outcome, { headers: { "Cache-Control": "private, no-store" } });
  }
  const [status, error] = ERRORS[outcome.status];
  return NextResponse.json({ code: outcome.status, error }, { status });
}
