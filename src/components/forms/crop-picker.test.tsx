import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CropPicker, type CropPickerOption } from "./crop-picker";

const crops: CropPickerOption[] = [
  { code: "COTTON", nameFr: "Coton" },
  { code: "MAIZE", nameFr: "Maïs", suggested: true },
  { code: "CASSAVA", nameFr: "Manioc", suggested: true },
  { code: "YAM", nameFr: "Igname" },
];

describe("CropPicker", () => {
  it("place les cultures proposées en premier et les signale", () => {
    render(<CropPicker id="cultures" crops={crops} value={[]} onChange={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Maïsproposé pour votre zone",
      "Maniocproposé pour votre zone",
      "Coton",
      "Igname",
    ]);
    expect(screen.getByRole("group")).toBeInTheDocument();
  });

  it("marque la sélection avec aria-pressed et rend chaque pictogramme accessible", () => {
    render(<CropPicker id="cultures" crops={crops} value={["MAIZE"]} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /maïs/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /coton/i })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("img", { name: "Maïs" })).toBeInTheDocument();
  });

  it("ajoute puis retire une culture", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CropPicker id="cultures" crops={crops} value={[]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /igname/i }));
    expect(onChange).toHaveBeenLastCalledWith(["YAM"]);

    rerender(<CropPicker id="cultures" crops={crops} value={["YAM"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /igname/i }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("bloque les autres cultures une fois la limite atteinte", () => {
    const onChange = vi.fn();
    render(
      <CropPicker
        id="cultures"
        crops={crops}
        value={["MAIZE", "CASSAVA"]}
        onChange={onChange}
        max={2}
      />,
    );
    const cotton = screen.getByRole("button", { name: /coton/i });
    expect(cotton).toBeDisabled();
    fireEvent.click(cotton);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/2 sur 2 cultures choisies/)).toHaveTextContent("retirez-en une");
    // La culture déjà choisie reste retirable.
    expect(screen.getByRole("button", { name: /maïs/i })).toBeEnabled();
  });
});
