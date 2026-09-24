import { CheckCircle2, CircleAlert } from "lucide-react";
import { SourceCaption } from "@/components/data-display/source-caption";
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

  const items = [
    { title: "Application", ok: true, detail: "Next.js 16, rendu serveur" },
    {
      title: "Base de données",
      ok: database.status === "up",
      detail:
        database.status === "up"
          ? `PostgreSQL ${database.postgresVersion}, ${database.latencyMs} ms`
          : "connexion indisponible",
    },
    {
      title: "PostGIS",
      ok: database.status === "up" && database.postgisVersion !== null,
      detail:
        database.status === "up" && database.postgisVersion
          ? `extension ${database.postgisVersion}`
          : "extension absente",
    },
  ];

  return (
    <section id="etat-plateforme" aria-labelledby="etat-titre" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <h2 id="etat-titre" className="text-lg font-semibold">
          État de la plateforme
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <li
              key={item.title}
              className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3"
            >
              {item.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              ) : (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden />
              )}
              <div className="text-sm">
                <p className="font-medium">
                  {item.title}
                  <span className="sr-only">{item.ok ? ", opérationnel" : ", indisponible"}</span>
                </p>
                <p className="tabular text-muted-foreground">{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>
        <SourceCaption className="mt-4" source="sonde interne /api/health" date={checkedAt} />
      </div>
    </section>
  );
}
