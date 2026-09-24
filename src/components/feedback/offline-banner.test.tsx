import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OfflineBanner } from "./offline-banner";

function setOnline(value: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
}

describe("OfflineBanner", () => {
  it("reste invisible quand la connexion est présente", () => {
    setOnline(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("apparaît quand la connexion est perdue", () => {
    setOnline(false);
    render(<OfflineBanner />);
    expect(screen.getByRole("status")).toHaveTextContent(/hors connexion/i);
  });

  it("réagit aux événements online et offline du navigateur", () => {
    setOnline(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    setOnline(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status")).toBeInTheDocument();

    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
