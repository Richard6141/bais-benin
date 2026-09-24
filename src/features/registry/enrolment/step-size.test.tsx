import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StepSize } from "./step-size";

describe("StepSize (écran A3)", () => {
  it("refuse une superficie vide puis un faire-valoir manquant, en français", () => {
    const onValidate = vi.fn();
    render(<StepSize value={null} onValidate={onValidate} onBack={vi.fn()} onLater={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(screen.getByText(/Indiquez la superficie/)).toBeInTheDocument();
    expect(onValidate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Superficie totale"), { target: { value: "2,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(screen.getByText("Choisissez le mode de faire-valoir.")).toBeInTheDocument();
    expect(onValidate).not.toHaveBeenCalled();
  });

  it("valide la section avec la saisie brute, le faire-valoir et l'irrigation", () => {
    const onValidate = vi.fn();
    render(<StepSize value={null} onValidate={onValidate} onBack={vi.fn()} onLater={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Superficie totale"), { target: { value: "2,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Terre familiale" }));
    fireEvent.click(screen.getByRole("button", { name: "Goutte-à-goutte" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));

    expect(onValidate).toHaveBeenCalledWith({
      areaHa: "2,5",
      tenure: "FAMILY",
      irrigation: "DRIP",
    });
    expect(screen.getByRole("button", { name: "Terre familiale" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("signale sans bloquer une superficie très élevée et propose la somme des parcelles", () => {
    render(
      <StepSize
        value={null}
        parcelsTotalHa={3.2}
        onValidate={vi.fn()}
        onBack={vi.fn()}
        onLater={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Superficie totale")).toHaveValue("3,2");
    expect(screen.getByText("Proposée depuis les parcelles décrites.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Superficie totale"), { target: { value: "120" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Superficie très élevée");
    expect(screen.getByRole("button", { name: "Continuer" })).toBeEnabled();
  });
});
