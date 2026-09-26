import type { Metadata } from "next";
import { requireRole } from "@/features/auth/session";
import { SituationRoom } from "@/features/watch/situation-room";
import { getWatchSummary } from "@/modules/watch";

export const metadata: Metadata = { title: "Salle de situation" };
export const dynamic = "force-dynamic";

// Salle de situation : la veille nationale en plein écran, sans en-tête ni navigation, pour un
// mur d'écrans ou un vidéoprojecteur. Réservée au ministère, comme le centre de veille.
export default async function SituationRoomPage() {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/salle-de-situation" });
  const summary = await getWatchSummary(user.actor);
  return <SituationRoom initial={summary} />;
}
