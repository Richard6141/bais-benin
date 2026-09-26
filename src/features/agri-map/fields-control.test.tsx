import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FieldsControl } from "./fields-control";
import { FIELDS_ATTRIBUTION } from "./map-config";

const FORBIDDEN_MARKS = /[·…—]/;

describe("FieldsControl", () => {
  it("bascule la couche et explique la source dans une aide", () => {
    const onChange = vi.fn();
    render(<FieldsControl checked={false} zoom={13} onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch", { name: "Champs détectés" }));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: "Aide : champs détectés" })).toBeInTheDocument();
  });

  it("invite à se rapprocher seulement quand la couche est active sous le zoom 12", () => {
    const { rerender } = render(<FieldsControl checked zoom={9} onChange={vi.fn()} />);
    expect(screen.getByText("Rapprochez-vous pour les voir.")).toBeInTheDocument();
    rerender(<FieldsControl checked zoom={13} onChange={vi.fn()} />);
    expect(screen.queryByText("Rapprochez-vous pour les voir.")).not.toBeInTheDocument();
    rerender(<FieldsControl checked={false} zoom={9} onChange={vi.fn()} />);
    expect(screen.queryByText("Rapprochez-vous pour les voir.")).not.toBeInTheDocument();
  });

  it("cite Fields of The World sous licence CC BY 4.0 dans l'attribution, sans signe interdit", () => {
    expect(FIELDS_ATTRIBUTION).toContain("Fields of The World");
    expect(FIELDS_ATTRIBUTION).toContain("CC BY 4.0");
    expect(FIELDS_ATTRIBUTION).not.toMatch(FORBIDDEN_MARKS);
  });
});
