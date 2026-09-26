import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConfidenceGauge } from "./confidence-gauge";
import { SourceList } from "./source-list";

describe("ConfidenceGauge", () => {
  it("dit la confiance en mots, jamais en pourcentage", () => {
    render(<ConfidenceGauge level="to_confirm" words="À confirmer avec votre agent" />);
    expect(screen.getByText("Confiance : À confirmer avec votre agent")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});

describe("SourceList", () => {
  it("replie les sources et montre organisme, licence, extraits et mention démonstration", () => {
    const { container } = render(
      <SourceList
        sources={[
          {
            slug: "mais-semis",
            title: "Maïs : semis et fertilisation",
            organization: "IITA",
            sourceTitle: "Guide de production du maïs",
            url: "https://example.org/guide",
            licence: "CC BY 4.0",
            demonstration: true,
            checkedOn: "2026-09-25",
            quotes: ["Semer après une pluie d'au moins 20 mm."],
          },
        ]}
      />,
    );
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(screen.getByText("1 source citée")).toBeInTheDocument();
    expect(screen.getByText("démonstration")).toBeInTheDocument();
    expect(screen.getByText(/\(CC BY 4\.0\), vérifiée le 25 septembre 2026/)).toBeInTheDocument();
    expect(screen.getByText("Semer après une pluie d'au moins 20 mm.")).toBeInTheDocument();
  });

  it("n'affiche rien sans source", () => {
    const { container } = render(<SourceList sources={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
