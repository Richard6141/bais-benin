import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiActor } from "@/features/auth/api-actor";
import { getFireBrief } from "@/modules/fires/brief";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

// Fiche courte d'un feu détecté (chantier K), ouverte au clic sur la carte publique et le centre
// de veille. Accessible sans connexion : les comptes restent nationaux et jamais nominatifs pour
// un visiteur, resserrés au périmètre de l'acteur connecté (agent, producteur) sinon.
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  }
  const api = await getApiActor(request.headers);
  const brief = await getFireBrief(api?.actor ?? null, id);
  if (!brief) return NextResponse.json({ error: "Feu introuvable" }, { status: 404 });
  return NextResponse.json(brief, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
