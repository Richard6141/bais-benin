import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Authentification des tâches planifiées, sans serveur ni base : l'environnement et les modules
// métier sont remplacés par des doubles. Couvre POST (planificateur Docker, crontab) et GET
// (Vercel Cron), qui doivent se comporter à l'identique.

const SECRET = "s".repeat(40);
const env = vi.hoisted(() => ({ current: { CRON_SECRET: undefined as string | undefined } }));
const calls = vi.hoisted(() => ({
  runDailyMonitoring: vi.fn(async () => ({
    ingestion: { runId: "run-1" },
    evaluation: {
      referenceDate: "2026-09-24",
      evaluations: 462,
      matched: 1,
      raised: ["alert-1"],
      extended: 0,
      expired: 0,
      staleCommunes: 0,
    },
    dispatch: { sent: 0 },
  })),
  runDispatch: vi.fn(async () => ({ considered: 0, sent: 0 })),
  sendFarmerNotifications: vi.fn(async () => ({ considered: 0, sent: 0 })),
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({ ...env.current, WEATHER_PROVIDER: "fixture", OPEN_METEO_BASE_URL: "" }),
}));
vi.mock("@/modules/monitoring", () => ({
  runDailyMonitoring: calls.runDailyMonitoring,
  runDispatch: calls.runDispatch,
  MonitoringBusyError: class MonitoringBusyError extends Error {},
}));
vi.mock("@/modules/notifications", () => ({
  sendFarmerNotifications: calls.sendFarmerNotifications,
}));
vi.mock("@/modules/analytics/refresh", () => ({
  refreshAnalyticsQuietly: async () => ({ refreshed: false, reason: "fresh", views: [] }),
}));
vi.mock("@/services/messaging", () => ({ getMessagingChannel: () => ({ id: "fixture" }) }));
vi.mock("@/services/weather", () => ({ createWeatherProviders: () => ({ primary: {} }) }));

const ingest = await import("../ingest/route");
const dispatch = await import("../dispatch/route");

function request(method: "GET" | "POST", path: string, authorization?: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: authorization ? { authorization } : {},
  });
}

const ROUTES = [
  {
    name: "ingest",
    path: "/api/v1/monitoring/ingest",
    module: ingest,
    spy: calls.runDailyMonitoring,
  },
  {
    name: "dispatch",
    path: "/api/v1/monitoring/dispatch",
    module: dispatch,
    spy: calls.runDispatch,
  },
] as const;

describe.each(ROUTES)("route planifiée $name", ({ path, module, spy }) => {
  beforeEach(() => {
    env.current.CRON_SECRET = SECRET;
    spy.mockClear();
  });

  it("expose GET pour Vercel Cron, identique à POST", () => {
    expect(module.GET).toBe(module.POST);
  });

  it.each(["GET", "POST"] as const)(
    "%s refuse sans en-tête et avec un mauvais secret",
    async (method) => {
      const handler = module[method];
      expect((await handler(request(method, path))).status).toBe(401);
      expect((await handler(request(method, path, `Bearer ${"x".repeat(40)}`))).status).toBe(401);
      expect((await handler(request(method, path, SECRET))).status).toBe(401);
      // Le schéma « Bearer » doit être exact. Un espace final, lui, est retiré par l'API Headers.
      expect((await handler(request(method, path, `bearer ${SECRET}`))).status).toBe(401);
      expect(spy).not.toHaveBeenCalled();
    },
  );

  it.each(["GET", "POST"] as const)("%s exécute la tâche avec le bon secret", async (method) => {
    const response = await module[method](request(method, path, `Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("reste fermée quand aucun secret n'est configuré", async () => {
    env.current.CRON_SECRET = undefined;
    expect((await module.GET(request("GET", path, "Bearer "))).status).toBe(401);
    expect((await module.GET(request("GET", path, "Bearer undefined"))).status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });
});
