import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getAgentDatabase } from "@/lib/offline/db";
import { OutboxList } from "./outbox-list";

const USER_ID = "019284a0-0000-7000-8000-00000000f001";

describe("OutboxList", () => {
  it("propose réessayer et abandonner à taille de doigt (44 px) pour une commande rejetée", async () => {
    const db = getAgentDatabase(USER_ID);
    await db.outbox.add({
      id: "cmd-1",
      type: "farm.create",
      payload: { id: "farm-1" },
      idempotencyKey: "cmd-1",
      clientCreatedAt: new Date().toISOString(),
      sequence: 1,
      status: "REJECTED",
      attempts: 1,
      lastError: { code: "INVALID", message: "Commune inconnue" },
      updatedAt: new Date().toISOString(),
    });

    render(<OutboxList userId={USER_ID} />);

    const retry = await waitFor(() => screen.getByRole("button", { name: /Réessayer/ }));
    const discard = screen.getByRole("button", { name: /Abandonner/ });
    // h-11 (44 px) : la taille de bouton par défaut, mobile-sûre ; jamais size="sm" (h-8, 32 px)
    // pour une action que l'agent tape en plein champ.
    expect(retry.className).toMatch(/\bh-11\b/);
    expect(discard.className).toMatch(/\bh-11\b/);
    expect(retry.className).not.toMatch(/\bh-8\b/);
    expect(discard.className).not.toMatch(/\bh-8\b/);
  });
});
