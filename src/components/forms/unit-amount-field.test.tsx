import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  HARVEST_UNITS,
  UnitAmountField,
  describeKgEquivalent,
  parseAmount,
} from "./unit-amount-field";

describe("UnitAmountField", () => {
  it("accepte la virgule décimale française", () => {
    expect(parseAmount("12,5")).toBe(12.5);
    expect(parseAmount("12.5")).toBe(12.5);
    expect(parseAmount("1 250")).toBe(1250);
    expect(Number.isNaN(parseAmount(""))).toBe(true);
    expect(Number.isNaN(parseAmount("1,2,3"))).toBe(true);
  });

  it("calcule l'équivalent en kilogrammes quand le facteur est connu", () => {
    expect(describeKgEquivalent({ amount: "2,5", unit: "BAG_100KG" }, HARVEST_UNITS)).toBe(
      "≈ 250 kg",
    );
    // Intl sépare les milliers par une espace fine insécable ; on compare sans tenir compte des espaces.
    expect(
      describeKgEquivalent({ amount: "1,5", unit: "T" }, HARVEST_UNITS)?.replace(/\s/g, ""),
    ).toBe("≈1500kg");
    expect(describeKgEquivalent({ amount: "3", unit: "BASIN" }, HARVEST_UNITS)).toBe(
      "équivalent kg non normalisé",
    );
    expect(describeKgEquivalent({ amount: "", unit: "KG" }, HARVEST_UNITS)).toBeNull();
  });

  it("affiche le libellé, la saisie et l'équivalent", () => {
    render(
      <UnitAmountField
        id="recolte"
        label="Quantité récoltée"
        value={{ amount: "8", unit: "BAG_100KG" }}
        onChange={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("Quantité récoltée");
    expect(input).toHaveAttribute("inputmode", "decimal");
    expect(input).toHaveValue("8");
    expect(screen.getByText("≈ 800 kg")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Unité" })).toHaveTextContent("sac de 100 kg");
  });

  it("ne transmet que des chiffres et un séparateur décimal", () => {
    const onChange = vi.fn();
    render(
      <UnitAmountField
        id="recolte"
        label="Quantité"
        value={{ amount: "", unit: "KG" }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Quantité"), { target: { value: "1a2,5kg" } });
    expect(onChange).toHaveBeenCalledWith({ amount: "12,5", unit: "KG" });
  });

  it("relie le message d'erreur au champ", () => {
    render(
      <UnitAmountField
        id="recolte"
        label="Quantité"
        value={{ amount: "0", unit: "KG" }}
        onChange={vi.fn()}
        error="Indiquez une quantité supérieure à zéro."
      />,
    );
    const input = screen.getByLabelText("Quantité");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain("recolte-error");
    expect(screen.getByText("Indiquez une quantité supérieure à zéro.")).toBeInTheDocument();
  });
});
