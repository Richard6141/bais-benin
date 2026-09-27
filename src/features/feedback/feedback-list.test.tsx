import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FeedbackRow } from "@/modules/feedback/service";

vi.mock("./manage-actions", () => ({ updateFeedbackStatusAction: vi.fn() }));

import { FeedbackList } from "./feedback-list";

// Liste des avis (chantier J) : contexte de chaque avis, étapes proposées selon l'état, jamais
// l'auteur.

function row(overrides: Partial<FeedbackRow>): FeedbackRow {
  return {
    id: "019284a0-0000-7000-8000-00000000f001",
    createdAt: new Date("2026-09-27T09:00:00Z"),
    kind: "BUG",
    role: "FARMER",
    message: "La carte ne charge pas [numéro masqué]",
    rating: 2,
    pagePath: "/agriculteur/champs",
    device: "MOBILE",
    status: "NEW",
    statusChangedAt: null,
    ...overrides,
  };
}

describe("avis des testeurs, vue du ministère", () => {
  it("montre le contexte de l'avis et les étapes selon l'état", () => {
    render(
      <FeedbackList
        rows={[
          row({}),
          row({
            id: "019284a0-0000-7000-8000-00000000f002",
            kind: "IDEA",
            role: "ADMIN_STATE",
            status: "DONE",
            device: "DESKTOP",
            rating: null,
            message: "Ajouter un export",
          }),
        ]}
      />,
    );
    const first = screen.getByText(/La carte ne charge pas/).closest("li")!;
    expect(within(first).getByText("Nouveau")).toBeInTheDocument();
    expect(within(first).getByText("Quelque chose ne marche pas")).toBeInTheDocument();
    expect(within(first).getByText("Agriculteur")).toBeInTheDocument();
    expect(within(first).getByText("Téléphone")).toBeInTheDocument();
    expect(within(first).getByText("Note 2 sur 5")).toBeInTheDocument();
    expect(within(first).getByRole("button", { name: "Marquer vu" })).toBeInTheDocument();
    const done = screen.getByText("Ajouter un export").closest("li")!;
    expect(within(done).getByText("Traité")).toBeInTheDocument();
    expect(within(done).getByRole("button", { name: "Rouvrir" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[·…—]/);
  });

  it("dit quand aucun avis ne correspond", () => {
    render(<FeedbackList rows={[]} />);
    expect(screen.getByText("Aucun avis pour ces filtres")).toBeInTheDocument();
  });
});
