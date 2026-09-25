import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LocationPicker, describeLocateError } from "./location-picker";

describe("LocationPicker", () => {
  it("récupère la position en un geste et affiche la précision", async () => {
    const onChange = vi.fn();
    const locate = vi.fn().mockResolvedValue({ lng: 1.6667, lat: 9.7, accuracyM: 8 });
    render(<LocationPicker value={null} onChange={onChange} locate={locate} />);

    fireEvent.click(screen.getByRole("button", { name: "Utiliser ma position" }));
    expect(screen.getByRole("button", { name: /recherche de la position/i })).toBeDisabled();

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ lng: 1.6667, lat: 9.7, accuracyM: 8 }),
    );
    expect(screen.getByRole("button", { name: "Utiliser ma position" })).toBeEnabled();
  });

  it("affiche le libellé fourni par le parent, les coordonnées et la précision", () => {
    render(
      <LocationPicker
        value={{ lng: 1.6667, lat: 9.7, accuracyM: 22 }}
        onChange={vi.fn()}
        locate={vi.fn()}
        label="Djougou, Donga"
      />,
    );
    expect(screen.getByText("Djougou, Donga")).toBeInTheDocument();
    expect(screen.getByText("9,7 N, 1,6667 E")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Précision moyenne");
  });

  it("explique le refus de localisation en français", async () => {
    const locate = vi.fn().mockRejectedValue({ code: 1 });
    render(<LocationPicker value={null} onChange={vi.fn()} locate={locate} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Utiliser ma position" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Autorisez la localisation");
    expect(describeLocateError({ code: 3 })).toMatch(/trop de temps/);
    expect(describeLocateError(new Error("x"))).toMatch(/indisponible/);
  });

  it("accepte une saisie manuelle dans les bornes du Bénin et refuse le reste", () => {
    const onChange = vi.fn();
    render(<LocationPicker value={null} onChange={onChange} locate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Saisir la position à la main" }));

    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "48,85" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "2,35" } });
    fireEvent.click(screen.getByRole("button", { name: "Utiliser ces coordonnées" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("hors du Bénin");

    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "9,70" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "1,67" } });
    fireEvent.click(screen.getByRole("button", { name: "Utiliser ces coordonnées" }));
    expect(onChange).toHaveBeenCalledWith({ lat: 9.7, lng: 1.67 });
  });
});
