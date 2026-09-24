import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/modules/platform";

export const dynamic = "force-dynamic";

// Sonde de santé pour Docker, la CI et la supervision. Ne révèle aucune
// information de configuration : uniquement l'état et les versions.
export async function GET() {
  const database = await checkDatabaseHealth();
  const healthy = database.status === "up";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      checkedAt: new Date().toISOString(),
      database,
    },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
