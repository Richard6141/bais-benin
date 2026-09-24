import { CheckCircle2, CircleAlert } from "lucide-react";
import { SourceCaption } from "@/components/data-display/source-caption";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { checkDatabaseHealth } from "@/modules/platform";

export const dynamic = "force-dynamic";

// État technique de la plateforme, rendu côté serveur à chaque requête.
// Sert de vérification manuelle immédiate après un déploiement.
export async function PlatformStatus() {
  const database = await checkDatabaseHealth();
  const checkedAt = new Intl.DateTimeFormat("fr-BJ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  return (
    <section id="etat-plateforme" aria-labelledby="etat-titre" className="scroll-mt-20 bg-muted/40">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <h2 id="etat-titre" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          État de la plateforme
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatusCard title="Application" ok detail="Next.js 16 · rendu serveur" />
          <StatusCard
            title="Base de données"
            ok={database.status === "up"}
            detail={
              database.status === "up"
                ? `PostgreSQL ${database.postgresVersion} · ${database.latencyMs} ms`
                : "connexion indisponible"
            }
          />
          <StatusCard
            title="PostGIS"
            ok={database.status === "up" && database.postgisVersion !== null}
            detail={
              database.status === "up" && database.postgisVersion
                ? `extension ${database.postgisVersion}`
                : "extension absente"
            }
          />
        </div>
        <SourceCaption className="mt-6" source="sonde interne /api/health" date={checkedAt} />
      </div>
    </section>
  );
}

function StatusCard({ title, ok, detail }: { title: string; ok: boolean; detail: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <Badge variant={ok ? "success" : "critical"}>
          {ok ? (
            <CheckCircle2 className="size-3.5" aria-hidden />
          ) : (
            <CircleAlert className="size-3.5" aria-hidden />
          )}
          {ok ? "Opérationnel" : "Indisponible"}
        </Badge>
      </CardHeader>
      <CardContent>
        <p className="tabular text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
