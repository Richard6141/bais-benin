import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { HarvestDeclarationDemo } from "./harvest-declaration-demo";

describe("HarvestDeclarationDemo", () => {
  it("refuse une soumission vide avec des messages en français", async () => {
    const user = userEvent.setup();
    render(<HarvestDeclarationDemo />);

    await user.click(screen.getByRole("button", { name: "Enregistrer la déclaration" }));

    expect(await screen.findByText("Choisissez une culture")).toBeInTheDocument();
    expect(screen.getByText("Indiquez une quantité")).toBeInTheDocument();
    expect(screen.getByText(/Le consentement est nécessaire/)).toBeInTheDocument();
  });

  it("refuse une quantité nulle ou négative", async () => {
    const user = userEvent.setup();
    render(<HarvestDeclarationDemo />);

    await user.type(screen.getByLabelText("Quantité récoltée"), "0");
    await user.click(screen.getByRole("button", { name: "Enregistrer la déclaration" }));

    expect(await screen.findByText("La quantité doit être supérieure à zéro")).toBeInTheDocument();
  });
});
