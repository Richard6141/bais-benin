import { NextResponse, type NextRequest } from "next/server";
import { dispatchPendingDeliveries } from "@/modules/monitoring/delivery";
import { getMessagingChannel } from "@/services/messaging";
import { isCronRequest } from "../cron-auth";

export const dynamic = "force-dynamic";

// Tâche planifiée fréquente (toutes les 10 minutes) : envoi des messages d'alerte en attente,
// relances après échec, libération des envois différés par le silence nocturne.
export async function POST(request: NextRequest) {
  if (!isCronRequest(request.headers)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const summary = await dispatchPendingDeliveries({
    messaging: { WHATSAPP: getMessagingChannel(), SMS: null },
  });
  return NextResponse.json(summary);
}

// Vercel Cron appelle les tâches planifiées en GET, avec le même en-tête
// `Authorization: Bearer <CRON_SECRET>` : même traitement, même contrôle (ADR-0006).
export const GET = POST;
