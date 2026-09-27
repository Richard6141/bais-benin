import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { prisma } from "@/database/client";
import { cleanAssistantConversations } from "./e2e-clean-assistant";

// Nettoyage de la base de démonstration après les tests de bout en bout du registre.
//
//   tsx scripts/e2e-clean.ts snapshot --out <fichier>      état des exploitations avant la suite
//   tsx scripts/e2e-clean.ts clean --since <iso> --snapshot <fichier> [--dry-run]
//   tsx scripts/e2e-clean.ts clean [--dry-run]               producteurs « Testhors » seulement
//
// Toutes les écritures des parcours passent par des commandes de synchronisation (hors ligne ou
// en ligne) : la table sync_command dit donc exactement ce que la suite a créé. Le nettoyage
// borné part de ces commandes ; les producteurs de test, repérables à leur nom, sont supprimés
// dans tous les cas avec tout ce qui en dépend. Le journal d'audit est en ajout seul (docs/04
// §10) : il n'est jamais touché.

const TEST_LAST_NAME_PREFIX = "Testhors";
// Comptes de démonstration utilisés par tests/e2e/registry.spec.ts.
const SUITE_PHONES = ["+2290190000001", "+2290190000002"];

interface FarmSnapshot {
  id: string;
  verificationStatus: string;
  verifiedAt: string | null;
  verifiedById: string | null;
  reliability: string;
  declaredAreaHa: string;
  version: number;
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const dryRun = process.argv.includes("--dry-run");

async function snapshot(out: string) {
  const farms = await prisma.farm.findMany({
    select: {
      id: true,
      verificationStatus: true,
      verifiedAt: true,
      verifiedById: true,
      reliability: true,
      declaredAreaHa: true,
      version: true,
    },
  });
  const rows: FarmSnapshot[] = farms.map((farm) => ({
    ...farm,
    verifiedAt: farm.verifiedAt?.toISOString() ?? null,
    declaredAreaHa: farm.declaredAreaHa.toString(),
  }));
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify({ takenAt: new Date().toISOString(), farms: rows }));
  console.log(`Instantané de ${rows.length} exploitations écrit dans ${out}`);
}

/** Identifiants d'entités portés par une charge utile de commande. */
function idsOf(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null) return [];
  const record = payload as Record<string, unknown>;
  return ["id", "farmerId", "farmId", "parcelId", "parcelCropId"]
    .map((key) => record[key])
    .filter((value): value is string => typeof value === "string");
}

async function clean(since: Date | null, snapshotPath: string | undefined) {
  const counts: Record<string, number> = {};
  const add = (key: string, value: number) => (counts[key] = (counts[key] ?? 0) + value);

  await prisma
    .$transaction(
      async (tx) => {
        // 1. Producteurs de test et tout ce qui en dépend, dans l'ordre des clés étrangères.
        const farmers = await tx.farmer.findMany({
          where: { lastName: { startsWith: TEST_LAST_NAME_PREFIX } },
          select: { id: true },
        });
        const farmerIds = farmers.map((f) => f.id);
        const farms = await tx.farm.findMany({
          where: { farmerId: { in: farmerIds } },
          select: { id: true },
        });
        const farmIds = farms.map((f) => f.id);
        const parcels = await tx.parcel.findMany({
          where: { farmId: { in: farmIds } },
          select: { id: true },
        });
        const parcelIds = parcels.map((p) => p.id);
        const parcelCrops = await tx.parcelCrop.findMany({
          where: { parcelId: { in: parcelIds } },
          select: { id: true },
        });
        const parcelCropIds = parcelCrops.map((c) => c.id);
        const testEntityIds = new Set([...farmerIds, ...farmIds, ...parcelIds, ...parcelCropIds]);

        add(
          "production_declaration",
          (
            await tx.productionDeclaration.deleteMany({
              where: { parcelCropId: { in: parcelCropIds } },
            })
          ).count,
        );
        add(
          "parcel_crop",
          (await tx.parcelCrop.deleteMany({ where: { id: { in: parcelCropIds } } })).count,
        );
        // Cultures vues pendant une visite : elles pointent la visite et la parcelle.
        add(
          "parcel_crop_observation",
          (
            await tx.parcelCropObservation.deleteMany({
              where: {
                OR: [
                  { parcelId: { in: parcelIds } },
                  { verification: { farmId: { in: farmIds } } },
                ],
              },
            })
          ).count,
        );
        add(
          "farm_verification",
          (await tx.farmVerification.deleteMany({ where: { farmId: { in: farmIds } } })).count,
        );
        add("parcel", (await tx.parcel.deleteMany({ where: { id: { in: parcelIds } } })).count);
        add(
          "farm_event",
          (await tx.farmEvent.deleteMany({ where: { farmId: { in: farmIds } } })).count,
        );
        add("farm", (await tx.farm.deleteMany({ where: { id: { in: farmIds } } })).count);
        add("farmer", (await tx.farmer.deleteMany({ where: { id: { in: farmerIds } } })).count);

        // Commandes qui visaient ces entités, quelle que soit leur date.
        const allCommands = await tx.syncCommand.findMany({ select: { id: true, payload: true } });
        const testCommandIds = allCommands
          .filter((command) => idsOf(command.payload).some((id) => testEntityIds.has(id)))
          .map((command) => command.id);
        add(
          "sync_command",
          (await tx.syncCommand.deleteMany({ where: { id: { in: testCommandIds } } })).count,
        );

        if (since) await cleanSuiteWrites(tx, since, snapshotPath, add);
        if (dryRun) throw new DryRunRollback();
      },
      { timeout: 60_000 },
    )
    .catch((error: unknown) => {
      if (!(error instanceof DryRunRollback)) throw error;
    });

  const label = dryRun
    ? "Lignes qui seraient supprimées ou restaurées"
    : "Lignes supprimées ou restaurées";
  console.log(`${label}${since ? ` depuis ${since.toISOString()}` : " (producteurs de test)"} :`);
  for (const [table, count] of Object.entries(counts)) console.log(`  ${table} : ${count}`);
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function cleanSuiteWrites(
  tx: Tx,
  since: Date,
  snapshotPath: string | undefined,
  add: (key: string, value: number) => void,
) {
  // 2. Ce que la suite a écrit sur les données de démonstration existantes, retrouvé par les
  // commandes reçues des comptes de test depuis le début de la suite.
  const users = await tx.user.findMany({
    where: { phoneNumber: { in: SUITE_PHONES } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  const suiteCommands = await tx.syncCommand.findMany({
    where: { userId: { in: userIds }, receivedAt: { gte: since } },
    select: { id: true, commandType: true, payload: true },
  });
  const payloadIds = (type: string) =>
    suiteCommands
      .filter((command) => command.commandType === type)
      .map((command) => (command.payload as { id?: string }).id)
      .filter((id): id is string => typeof id === "string");

  add(
    "production_declaration",
    (
      await tx.productionDeclaration.deleteMany({
        where: { id: { in: payloadIds("harvest.declare") } },
      })
    ).count,
  );

  const verificationIds = payloadIds("verification.record");
  const visited = await tx.farmVerification.findMany({
    where: { id: { in: verificationIds } },
    select: { farmId: true },
  });
  add(
    "parcel_crop_observation",
    (
      await tx.parcelCropObservation.deleteMany({
        where: { verificationId: { in: verificationIds } },
      })
    ).count,
  );
  add(
    "farm_verification",
    (await tx.farmVerification.deleteMany({ where: { id: { in: verificationIds } } })).count,
  );

  // Les exploitations visitées retrouvent exactement leur état d'avant la suite.
  const visitedFarmIds = [...new Set(visited.map((v) => v.farmId))];
  if (visitedFarmIds.length > 0) {
    const saved = snapshotPath
      ? (JSON.parse(await readFile(snapshotPath, "utf8")) as { farms: FarmSnapshot[] }).farms
      : [];
    const byId = new Map(saved.map((farm) => [farm.id, farm]));
    for (const farmId of visitedFarmIds) {
      const before = byId.get(farmId);
      await tx.farm.update({
        where: { id: farmId },
        data: before
          ? {
              verificationStatus: before.verificationStatus as never,
              verifiedAt: before.verifiedAt ? new Date(before.verifiedAt) : null,
              verifiedById: before.verifiedById,
              reliability: before.reliability as never,
              declaredAreaHa: before.declaredAreaHa,
              version: before.version,
            }
          : { verificationStatus: "DECLARED", verifiedAt: null, verifiedById: null },
      });
      add("farm (état restauré)", 1);
    }
  }

  add(
    "farm_event",
    (
      await tx.farmEvent.deleteMany({
        where: { actorId: { in: userIds }, occurredAt: { gte: since } },
      })
    ).count,
  );
  add(
    "sync_command",
    (await tx.syncCommand.deleteMany({ where: { id: { in: suiteCommands.map((c) => c.id) } } }))
      .count,
  );

  await cleanRuleChanges(tx, since, add);
  await cleanAssistantConversations(tx, since, SUITE_PHONES, add);
}

// Comptes dont les écritures depuis le début de la suite sont attribuées à celle-ci : les comptes
// de démonstration, que le pilotage utilise depuis ADR-0012 (ministere@bais.demo), et l'ancien
// domaine réservé des comptes ministère jetables, pour une base qui en garderait la trace.
const SUITE_EMAIL_SUFFIXES = ["@bais.demo", "@e2e.bais.invalid"];
const isSuiteEmail = (email: string) =>
  SUITE_EMAIL_SUFFIXES.some((suffix) => email.endsWith(suffix));

/**
 * Règles d'alerte modifiées par les parcours du pilotage (tests/e2e/rules.spec.ts) : les
 * versions créées depuis le début de la suite par un compte de la suite (ministère de
 * démonstration) sont supprimées, leurs simulations et évaluations avec elles, et chaque code
 * touché retrouve une version active (celle qui a été remplacée). Une version dont l'auteur
 * n'existe plus est aussi attribuée à la suite. Le journal d'audit n'est jamais modifié.
 */
async function cleanRuleChanges(tx: Tx, since: Date, add: (key: string, value: number) => void) {
  const created = await tx.rule.findMany({
    where: { createdAt: { gte: since }, createdById: { not: null } },
    select: { id: true, code: true, createdById: true, supersedesId: true },
    orderBy: { version: "desc" },
  });
  const authorIds = [...new Set(created.map((r) => r.createdById as string))];
  const authors = await tx.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, email: true },
  });
  const realAuthors = new Set(authors.filter((u) => !isSuiteEmail(u.email)).map((u) => u.id));
  const suiteVersions = created.filter((r) => !realAuthors.has(r.createdById as string));
  const touchedCodes = new Set(suiteVersions.map((r) => r.code));

  for (const version of suiteVersions) {
    const runs = await tx.simulationRun.findMany({
      where: { ruleId: version.id },
      select: { id: true },
    });
    add(
      "rule_evaluation",
      (
        await tx.ruleEvaluation.deleteMany({
          where: {
            OR: [{ ruleId: version.id }, { simulationId: { in: runs.map((r) => r.id) } }],
          },
        })
      ).count,
    );
    add(
      "simulation_run",
      (await tx.simulationRun.deleteMany({ where: { ruleId: version.id } })).count,
    );
    // Une alerte levée entre-temps par cette version est rattachée à la version remplacée.
    if (version.supersedesId) {
      await tx.alert.updateMany({
        where: { ruleId: version.id },
        data: { ruleId: version.supersedesId },
      });
    }
    await tx.rule.delete({ where: { id: version.id } });
    add("rule (version de test)", 1);
  }

  // Simulations lancées par un compte de la suite : elles visent souvent la version d'origine (un
  // brouillon est simulé contre la version active), et restent donc hors de la boucle ci-dessus.
  const runs = await tx.simulationRun.findMany({
    where: { createdAt: { gte: since }, requestedById: { not: null } },
    select: { id: true, requestedById: true },
  });
  const requesters = await tx.user.findMany({
    where: { id: { in: [...new Set(runs.map((r) => r.requestedById as string))] } },
    select: { id: true, email: true },
  });
  const realRequesters = new Set(requesters.filter((u) => !isSuiteEmail(u.email)).map((u) => u.id));
  const suiteRunIds = runs
    .filter((r) => !realRequesters.has(r.requestedById as string))
    .map((r) => r.id);
  add(
    "rule_evaluation",
    (await tx.ruleEvaluation.deleteMany({ where: { simulationId: { in: suiteRunIds } } })).count,
  );
  add(
    "simulation_run",
    (await tx.simulationRun.deleteMany({ where: { id: { in: suiteRunIds } } })).count,
  );

  // Codes désactivés ou modifiés par un compte de la suite (ou par un auteur supprimé depuis :
  // acteur nul) : la version la plus récente restante redevient active si aucune ne l'est.
  const toggled = await tx.auditLog.findMany({
    where: {
      action: { in: ["rule.toggled", "rule.updated"] },
      occurredAt: { gte: since },
      resourceType: "rule",
      OR: [
        { actorId: null },
        ...SUITE_EMAIL_SUFFIXES.map((suffix) => ({ actor: { email: { endsWith: suffix } } })),
      ],
    },
    select: { resourceId: true },
  });
  for (const entry of toggled) if (entry.resourceId) touchedCodes.add(entry.resourceId);
  for (const code of touchedCodes) {
    const active = await tx.rule.count({ where: { code, enabled: true } });
    if (active > 0) continue;
    const latest = await tx.rule.findFirst({ where: { code }, orderBy: { version: "desc" } });
    if (!latest) continue;
    await tx.rule.update({ where: { id: latest.id }, data: { enabled: true } });
    add("rule (réactivée)", 1);
  }
}

class DryRunRollback extends Error {}

async function main() {
  const command = process.argv[2];
  if (command === "snapshot") {
    const out = argument("out");
    if (!out) throw new Error("--out est requis");
    await snapshot(out);
  } else if (command === "clean") {
    const sinceArg = argument("since");
    const since = sinceArg ? new Date(sinceArg) : null;
    if (since && Number.isNaN(since.getTime())) throw new Error(`Date invalide : ${sinceArg}`);
    await clean(since, argument("snapshot"));
  } else if (command === "reset-rate-limits") {
    // Les parcours de bout en bout demandent beaucoup de codes depuis la même adresse : on remet
    // à zéro les compteurs de débit de l'authentification. Jamais en production.
    if (process.env.APP_ENV === "production") {
      throw new Error("Remise à zéro des limites de débit refusée en production");
    }
    const deleted = await prisma.rateLimit.deleteMany({});
    console.log(`Limites de débit remises à zéro : ${deleted.count}`);
  } else {
    throw new Error("Commande attendue : snapshot, clean ou reset-rate-limits");
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
