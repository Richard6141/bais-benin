import { NextResponse, type NextRequest } from "next/server";
import { refreshAnalyticsQuietly } from "@/modules/analytics/refresh";
import { MonitoringBusyError, runDispatch } from "@/modules/monitoring";
import { sendFarmerNotifications } from "@/modules/notifications";
import { getMessagingChannel } from "@/services/messaging";
import { isCronRequest } from "../cron-auth";

export const dynamic = "force-dynamic";

// Tâche planifiée fréquente (toutes les 10 minutes) : envoi des messages d'alerte en attente,
// relances après échec, libération des envois différés par le silence nocturne ; puis messages de
// suivi des producteurs (demandes, signalements) si le quota du fournisseur le permet ; enfin
// rafraîchissement des agrégats du tableau de bord s'ils ont vieilli (sans bloquer l'envoi).
export async function POST(request: NextRequest) {
  if (!isCronRequest(request.headers)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const messaging = getMessagingChannel();
    const summary = await runDispatch({ WHATSAPP: messaging, SMS: null });
    const followUps = summary.quotaReached ? null : await sendFarmerNotifications({ messaging });
    const analytics = await refreshAnalyticsQuietly();
    return NextResponse.json({ ...summary, followUps, analytics });
  } catch (error) {
    if (error instanceof MonitoringBusyError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

// Vercel Cron appelle les tâches planifiées en GET, avec le même en-tête
// `Authorization: Bearer <CRON_SECRET>` : même traitement, même contrôle (ADR-0006).
export const GET = POST;
