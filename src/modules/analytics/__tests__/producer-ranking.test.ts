import { describe, expect, it, vi } from "vitest";
import type { CampaignRow } from "@/database/sql/dashboard.sql";

// Logique pure seulement : aucune base n'est ouverte en test unitaire.
vi.mock("@/database/client", () => ({ prisma: {} }));

const {
  DEFAULT_RANKING_CROP,
  DEFAULT_RANKING_LIMIT,
  MAX_RANKING_LIMIT,
  parseProducerRankingFilters,
  rankingCampaign,
} = await import("../producer-ranking");

const campaign = (code: string, status: CampaignRow["status"], startYear: number): CampaignRow => ({
  id: code,
  code,
  status,
  start_year: startYear,
  starts_on: `${startYear}-04-01`,
  ends_on: `${startYear + 1}-03-31`,
});

describe("filtres du palmarès", () => {
  it("applique les valeurs par défaut : coton, 100 premiers, vérifiées seulement", () => {
    expect(parseProducerRankingFilters({})).toEqual({
      cropCode: DEFAULT_RANKING_CROP,
      metric: "production",
      verifiedOnly: true,
      limit: DEFAULT_RANKING_LIMIT,
    });
  });

  it("n'ouvre aux non vérifiées que sur demande explicite", () => {
    expect(parseProducerRankingFilters({ verifiedOnly: "0" }).verifiedOnly).toBe(false);
    expect(parseProducerRankingFilters({ verifiedOnly: "false" }).verifiedOnly).toBe(false);
    expect(parseProducerRankingFilters({ verifiedOnly: "1" }).verifiedOnly).toBe(true);
    expect(parseProducerRankingFilters({ verifiedOnly: "" }).verifiedOnly).toBe(true);
  });

  it("ignore un paramètre invalide sans perdre les autres", () => {
    const filters = parseProducerRankingFilters({
      cropCode: "MAIZE",
      limit: "99999",
      departementCode: "Borgou; DROP TABLE",
      communeCode: "BJ-BOR-005",
      metric: "yield",
    });
    expect(filters).toMatchObject({
      cropCode: "MAIZE",
      limit: DEFAULT_RANKING_LIMIT,
      communeCode: "BJ-BOR-005",
      metric: "yield",
    });
    expect(filters.departementCode).toBeUndefined();
    expect(parseProducerRankingFilters({ limit: String(MAX_RANKING_LIMIT) }).limit).toBe(
      MAX_RANKING_LIMIT,
    );
  });
});

describe("campagne du palmarès", () => {
  const campaigns = [
    campaign("2024-2025", "CLOSED", 2024),
    campaign("2025-2026", "CLOSED", 2025),
    campaign("2026-2027", "OPEN", 2026),
    campaign("2027-2028", "PLANNED", 2027),
  ];

  it("prend la dernière campagne close par défaut, pas celle en cours", () => {
    expect(rankingCampaign(campaigns).code).toBe("2025-2026");
  });

  it("respecte la campagne demandée et refuse une campagne inconnue", () => {
    expect(rankingCampaign(campaigns, "2024-2025").code).toBe("2024-2025");
    expect(() => rankingCampaign(campaigns, "1999-2000")).toThrow(/Campagne inconnue/);
  });
});
