import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const download = vi.fn<() => Promise<void>>();
let local: "missing" | "current" | "stale" | undefined = "missing";

vi.mock("dexie-react-hooks", () => ({ useLiveQuery: () => local }));
vi.mock("@/lib/offline/db", () => ({ getAgentDatabase: () => ({}) }));
vi.mock("@/lib/offline/referentiel-cache", () => ({
  downloadOfflineData: () => download(),
  loadReferentiel: vi.fn(),
}));

import { prepareOffline, useOfflinePreparation } from "./use-offline-preparation";

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value });
}

describe("préparation automatique du hors-ligne", () => {
  beforeEach(() => {
    download.mockReset();
    local = "missing";
    setOnline(true);
  });
  afterEach(() => setOnline(true));

  it("ne lance qu'un téléchargement à la fois pour un même compte", async () => {
    let finish: () => void = () => undefined;
    download.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const first = prepareOffline("agent-1");
    const second = prepareOffline("agent-1");
    expect(download).toHaveBeenCalledTimes(1);
    finish();
    await Promise.all([first, second]);
  });

  it("télécharge seul quand le référentiel manque et que l'appareil est en ligne", async () => {
    download.mockReturnValue(new Promise<void>(() => undefined));
    const { result } = renderHook(() => useOfflinePreparation("agent-2"));
    expect(result.current).toBe("running");
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
  });

  it("n'essaie pas sans réseau : le premier lancement reste le recours", () => {
    setOnline(false);
    const { result } = renderHook(() => useOfflinePreparation("agent-3"));
    expect(result.current).toBe("offline");
    expect(download).not.toHaveBeenCalled();
  });

  it("signale l'échec du téléchargement", async () => {
    download.mockRejectedValue(new Error("Référentiel indisponible (503)"));
    const { result } = renderHook(() => useOfflinePreparation("agent-4"));
    await waitFor(() => expect(result.current).toBe("failed"));
  });

  it("ne fait rien quand le référentiel est déjà sur l'appareil", () => {
    local = "current";
    const { result } = renderHook(() => useOfflinePreparation("agent-5"));
    expect(result.current).toBe("ready");
    expect(download).not.toHaveBeenCalled();
  });

  it("recharge en arrière-plan après une réaffectation, sans bloquer l'agent", async () => {
    local = "stale";
    download.mockResolvedValue(undefined);
    const { result } = renderHook(() => useOfflinePreparation("agent-6", "BJ-DON-001"));
    expect(result.current).toBe("ready");
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
  });

  it("ne recharge qu'une fois par périmètre, même si l'empreinte reste différente", async () => {
    local = "stale";
    download.mockResolvedValue(undefined);
    const first = renderHook(() => useOfflinePreparation("agent-7", "BJ-DON-002"));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    first.unmount();
    renderHook(() => useOfflinePreparation("agent-7", "BJ-DON-002"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(download).toHaveBeenCalledTimes(1);
  });
});
