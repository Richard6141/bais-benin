import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { checkDatabaseHealth } from "@/modules/platform";

// Exige une base PostGIS accessible via DATABASE_URL et les migrations appliquées.

describe("base de données", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("répond et expose PostGIS", async () => {
    const health = await checkDatabaseHealth();
    expect(health.status).toBe("up");
    if (health.status === "up") {
      expect(health.postgresVersion).toMatch(/^16\./);
      expect(health.postgisVersion).toMatch(/^3\./);
    }
  });

  it("a les extensions requises par les migrations", async () => {
    const rows = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname IN ('postgis', 'pg_trgm', 'citext', 'pgcrypto')
      ORDER BY extname
    `;
    expect(rows.map((row) => row.extname)).toEqual(["citext", "pg_trgm", "pgcrypto", "postgis"]);
  });

  it("calcule une surface géodésique avec PostGIS", async () => {
    // Un carré d'environ 1 km de côté près de Parakou : la surface doit approcher 1 km².
    const rows = await prisma.$queryRaw<{ area: number }[]>`
      SELECT ST_Area(
        ST_GeogFromText('POLYGON((2.62 9.34, 2.629 9.34, 2.629 9.349, 2.62 9.349, 2.62 9.34))')
      ) AS area
    `;
    const areaKm2 = (rows[0]?.area ?? 0) / 1_000_000;
    expect(areaKm2).toBeGreaterThan(0.9);
    expect(areaKm2).toBeLessThan(1.1);
  });
});
