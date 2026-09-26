import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SyncStatusChip, deriveSyncState, formatRelative } from "./sync-status-chip";

const NOW = new Date("2026-09-24T12:00:00Z").getTime();

describe("SyncStatusChip", () => {
  it("ordonne les états : erreur, hors ligne, en cours, en attente, à jour", () => {
    expect(deriveSyncState({ pending: 3, failed: 1, online: true, syncing: true })).toBe("ERROR");
    expect(deriveSyncState({ pending: 3, failed: 0, online: false, syncing: false })).toBe(
      "OFFLINE",
    );
    expect(deriveSyncState({ pending: 3, failed: 0, online: true, syncing: true })).toBe("SYNCING");
    expect(deriveSyncState({ pending: 3, failed: 0, online: true, syncing: false })).toBe(
      "PENDING",
    );
    expect(deriveSyncState({ pending: 0, failed: 0, online: true, syncing: false })).toBe(
      "UP_TO_DATE",
    );
  });

  it("formate le délai depuis la dernière synchronisation en français", () => {
    expect(formatRelative("2026-09-24T11:59:40Z", NOW)).toBe("à l'instant");
    expect(formatRelative("2026-09-24T11:55:00Z", NOW)).toBe("il y a 5 minutes");
    expect(formatRelative("2026-09-24T09:00:00Z", NOW)).toBe("il y a 3 heures");
    expect(formatRelative("2026-09-23T10:00:00Z", NOW)).toBe("hier");
  });

  it("annonce les éléments à envoyer et permet de synchroniser", () => {
    const onSync = vi.fn();
    render(
      <SyncStatusChip
        pending={3}
        failed={0}
        lastSyncedAt={null}
        online
        syncing={false}
        onSync={onSync}
      />,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("data-sync-state", "PENDING");
    expect(status).toHaveTextContent("3 à envoyer");
    fireEvent.click(screen.getByRole("button", { name: "Synchroniser maintenant" }));
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it("désactive la synchronisation hors ligne et le dit", () => {
    render(
      <SyncStatusChip
        pending={2}
        failed={0}
        lastSyncedAt={null}
        online={false}
        syncing={false}
        onSync={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Hors ligne (2 à envoyer)");
    expect(screen.getByRole("button", { name: "Synchroniser maintenant" })).toBeDisabled();
  });

  it("indique l'état à jour avec la date relative", () => {
    render(
      <SyncStatusChip
        pending={0}
        failed={0}
        lastSyncedAt="2026-09-24T11:55:00Z"
        online
        syncing={false}
        onSync={vi.fn()}
        now={() => NOW}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("À jour il y a 5 minutes");
  });

  it("met l'erreur en avant même hors ligne", () => {
    render(
      <SyncStatusChip
        pending={1}
        failed={2}
        lastSyncedAt={null}
        online={false}
        syncing={false}
        onSync={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveAttribute("data-sync-state", "ERROR");
    expect(screen.getByRole("status")).toHaveTextContent("2 en erreur");
  });
});
