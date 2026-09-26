import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StepShell } from "./step-shell";

describe("StepShell", () => {
  it("garde le bouton Retour à taille de doigt (44 px), comme le lien secondaire à côté", () => {
    render(
      <StepShell
        title="Titre"
        primaryLabel="Continuer"
        onPrimary={vi.fn()}
        onBack={vi.fn()}
        secondary={{ label: "Finir plus tard", onClick: vi.fn() }}
      >
        <p>Contenu</p>
      </StepShell>,
    );
    const back = screen.getByRole("button", { name: "Retour" });
    expect(back.className).toMatch(/\bh-11\b/);
    expect(back.className).not.toMatch(/\bh-8\b/);
    expect(screen.getByRole("button", { name: "Finir plus tard" }).className).toMatch(
      /\bmin-h-11\b/,
    );
  });
});
