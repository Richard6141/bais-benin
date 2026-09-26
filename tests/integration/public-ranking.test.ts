import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import { getProducerRanking, type ProducerRankingRow } from "@/modules/analytics";
import type { Actor } from "@/modules/authorization";
import { loadActor } from "@/modules/identity";
import {
  RANKING_CONSENT_TEXT,
  getPublicRanking,
  listPublicRankings,
  listPublishedRankings,
  publishRanking,
  rankingConsentOf,
  setRankingConsent,
  withdrawRanking,
} from "@/modules/public-ranking";

// Palmarès public (complément d'ADR-0018) : le ministère publie les premiers lauréats qui ont
// donné leur accord ; un producteur qui retire son accord disparaît aussitôt ; un palmarès retiré
// quitte la page publique. Accords, palmarès et journal créés ici sont retirés à la fin.

const since = new Date();
const CRITERIA = { cropCode: "COTTON", limit: "20" };
let ministry: Actor;
let agent: Actor;
let farmer: Actor;
let second: ProducerRankingRow;
let fourth: ProducerRankingRow;
let publishedId = "";

async function actorFor(where: { phoneNumber?: string; email?: string }) {
  const user = await prisma.user.findFirstOrThrow({ where, select: { id: true } });
  return loadActor(user.id);
}

describe("palmarès public", () => {
  beforeAll(async () => {
    await seedReferenceData();
    ministry = await actorFor({ email: "ministere@bais.demo" });
    agent = await actorFor({ phoneNumber: "+2290190000001" });
    farmer = await actorFor({ phoneNumber: "+2290190000002" });
    const ranking = await getProducerRanking(ministry, CRITERIA);
    expect(ranking.rows.length).toBeGreaterThanOrEqual(4);
    second = ranking.rows[1]!;
    fourth = ranking.rows[3]!;
    // Deux lauréats du classement acceptent d'être nommés (fiches sans compte : accord posé ici).
    await prisma.rankingConsent.createMany({
      data: [second, fourth].map((row) => ({ farmerId: row.farmerId, grantedAt: since })),
      skipDuplicates: true,
    });
  }, 240_000);

  afterAll(async () => {
    await prisma.publishedRanking.deleteMany({ where: { publishedAt: { gte: since } } });
    const demo = await prisma.farmer.findUnique({ where: { userId: farmer.userId } });
    await prisma.rankingConsent.deleteMany({
      where: { farmerId: { in: [second.farmerId, fourth.farmerId, demo?.id ?? ""] } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        action: {
          in: [
            "analytics.ranking.read",
            "analytics.ranking.published",
            "analytics.ranking.withdrawn",
            "consent.ranking.granted",
            "consent.ranking.revoked",
          ],
        },
        occurredAt: { gte: since },
      },
    });
    await prisma.$disconnect();
  });

  it("montre au ministère qui a donné son accord", async () => {
    const ranking = await getProducerRanking(ministry, CRITERIA);
    const consenting = ranking.rows.filter((row) => row.publicConsent).map((row) => row.rank);
    expect(consenting).toEqual(expect.arrayContaining([second.rank, fourth.rank]));
  });

  it("réserve la publication au ministère et ne publie que les consentants", async () => {
    expect(await publishRanking(agent, CRITERIA, 10)).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await publishRanking(ministry, CRITERIA, 0)).toEqual({ ok: false, code: "INVALID" });

    const published = await publishRanking(ministry, CRITERIA, 10);
    expect(published).toMatchObject({ ok: true, laureates: 2 });
    publishedId = published.ok ? published.id : "";

    const page = await getPublicRanking(publishedId);
    // Le rang reste celui du classement complet ; les non-consentants ne sont jamais nommés.
    expect(page?.entries.map((e) => e.rank)).toEqual([second.rank, fourth.rank]);
    expect(page?.entries[0]).toMatchObject({ name: second.farmerName });
    expect(Object.keys(page!.entries[0]!)).not.toContain("phone");
    expect(JSON.stringify(page)).not.toContain(second.phone ?? "sans-telephone");
    expect((await listPublicRankings()).map((r) => r.id)).toContain(publishedId);
  });

  it("laisse le producteur, et lui seul, donner et retirer son accord", async () => {
    expect(await setRankingConsent(agent, true)).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await setRankingConsent(farmer, true, since)).toEqual({ ok: true });
    expect(await rankingConsentOf(farmer)).toEqual({ available: true, grantedAt: since });

    const demo = await prisma.farmer.findUniqueOrThrow({ where: { userId: farmer.userId } });
    expect(
      await prisma.rankingConsent.findUniqueOrThrow({ where: { farmerId: demo.id } }),
    ).toMatchObject({ textVersion: RANKING_CONSENT_TEXT.version });
    await prisma.publishedRankingEntry.create({
      data: {
        rankingId: publishedId,
        rank: 999,
        farmerId: demo.id,
        displayName: "Lauréate de démonstration",
        communeName: "Djougou",
        departementName: "Donga",
        productionT: "1.000",
        areaHa: "1.000",
      },
    });
    expect((await getPublicRanking(publishedId))?.entries.map((e) => e.rank)).toContain(999);

    expect(await setRankingConsent(farmer, false)).toEqual({ ok: true });
    expect((await rankingConsentOf(farmer)).grantedAt).toBeNull();
    expect((await getPublicRanking(publishedId))?.entries.map((e) => e.rank)).not.toContain(999);
    expect(await prisma.publishedRankingEntry.count({ where: { farmerId: demo.id } })).toBe(0);
  });

  it("n'affiche plus un lauréat dont l'accord est retiré, même si sa ligne existe encore", async () => {
    await prisma.rankingConsent.update({
      where: { farmerId: fourth.farmerId },
      data: { revokedAt: new Date() },
    });
    expect((await getPublicRanking(publishedId))?.entries.map((e) => e.rank)).toEqual([
      second.rank,
    ]);
  });

  it("retire un palmarès de la page publique, et refuse de publier sans consentant", async () => {
    expect(await withdrawRanking(agent, publishedId)).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await withdrawRanking(ministry, publishedId)).toEqual({ ok: true });
    expect(await withdrawRanking(ministry, publishedId)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await getPublicRanking(publishedId)).toBeNull();
    expect((await listPublicRankings()).map((r) => r.id)).not.toContain(publishedId);
    const forMinistry = await listPublishedRankings(ministry);
    expect(forMinistry.find((r) => r.id === publishedId)?.withdrawnAt).not.toBeNull();
    expect(await listPublishedRankings(agent)).toEqual([]);

    await prisma.rankingConsent.update({
      where: { farmerId: second.farmerId },
      data: { revokedAt: new Date() },
    });
    expect(await publishRanking(ministry, CRITERIA, 10)).toEqual({
      ok: false,
      code: "NO_CONSENTING",
    });
  });
});
