import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const download = vi.fn<() => Promise<void>>();
let ready: boolean | undefined = false;

vi.mock("dexie-react-hooks", () => ({ useLiveQuery: () => ready }));
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
    ready = false;
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
    ready = true;
    const { result } = renderHook(() => useOfflinePreparation("agent-5"));
    expect(result.current).toBe("ready");
    expect(download).not.toHaveBeenCalled();
  });
});
