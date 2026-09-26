import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiActor } from "@/features/auth/api-actor";
import { getReportPhotoForActor } from "@/modules/reports";

export const dynamic = "force-dynamic";

// Photo d'un signalement, servie seulement à qui peut lire le signalement (report.read) ; sinon
// 404, comme pour un signalement inconnu. Jamais en cache, même dans le navigateur : sur un
// téléphone partagé, le compte suivant ne doit pas la retrouver.
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const api = await getApiActor(request.headers);
  if (!api) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  }
  const photo = await getReportPhotoForActor(api.actor, id);
  if (!photo) return NextResponse.json({ error: "Photo introuvable" }, { status: 404 });
  return new NextResponse(Buffer.from(photo.bytes), {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
