import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FieldGapsSection } from "./field-gaps-section";

describe("champs détectés sans exploitation", () => {
  it("liste les communes avec leur lien vers la carte", () => {
    const { container } = render(
      <FieldGapsSection
        year={2025}
        gaps={[
          {
            communeCode: "BJ-DON-003",
            communeName: "Djougou",
            detected: 120,
            unregistered: 45,
            appeared: 7,
          },
          {
            communeCode: "BJ-DON-001",
            communeName: "Copargo",
            detected: 30,
            unregistered: 30,
            appeared: null,
          },
        ]}
      />,
    );
    expect(screen.getByText(/45 sur 120 champs détectés/)).toHaveTextContent(
      "dont 7 apparus depuis 2024",
    );
    expect(screen.getByText(/30 sur 30 champs détectés/)).not.toHaveTextContent("apparus");
    expect(screen.getAllByRole("link", { name: "Voir sur la carte" })[0]).toHaveAttribute(
      "href",
      "/carte?champs=1&commune=BJ-DON-003",
    );
    expect(container.textContent).not.toMatch(/·|…|—/);
  });

  it("dit qu'il n'y a rien à enregistrer", () => {
    render(<FieldGapsSection gaps={[]} year={2025} />);
    expect(screen.getByText(/Aucun champ détecté en 2025/)).toBeInTheDocument();
  });
});
