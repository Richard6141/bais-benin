import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/offline/use-sync", () => ({
  useSync: () => ({ online: true, sync: vi.fn() }),
}));

const { SurveyForm } = await import("./survey-form");

const PARCEL = { id: "p1", code: "BJ-P-000001", declaredAreaHa: 1, version: 1 };

function corners(points: Array<[number, number]>) {
  const queue = [...points];
  return async (onSample?: (count: number, accuracyM: number | undefined) => void) => {
    onSample?.(1, 8);
    const [lng, lat] = queue.shift()!;
    return { lng, lat, accuracyM: 8 };
  };
}

async function mark(times: number) {
  for (let i = 1; i <= times; i++) {
    fireEvent.click(screen.getByRole("button", { name: /Marquer ce coin/ }));
    await waitFor(() => expect(screen.getByText(`Coin ${i}`)).toBeTruthy());
  }
}

describe("relevé à pied", () => {
  it("bloque un contour qui se croise", async () => {
    render(
      <SurveyForm
        userId="u1"
        farm={{ id: "f1" }}
        parcel={PARCEL}
        captureCorner={corners([
          [1.6, 9],
          [1.601, 9.001],
          [1.601, 9],
          [1.6, 9.001],
        ])}
      />,
    );
    await mark(4);
    expect(screen.getByText("Le contour se croise")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Terminer le relevé" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("refuse un coin pris au même endroit que le précédent", async () => {
    // Ordinateur sans GPS : la même position revient à chaque appui.
    render(
      <SurveyForm
        userId="u1"
        farm={{ id: "f1" }}
        parcel={PARCEL}
        captureCorner={corners([
          [2.41828, 6.38278],
          [2.41828, 6.38278],
        ])}
      />,
    );
    await mark(1);
    fireEvent.click(screen.getByRole("button", { name: /Marquer ce coin/ }));
    await waitFor(() => expect(screen.getByText(/au même endroit que le précédent/)).toBeTruthy());
    expect(screen.queryByText("Coin 2")).toBeNull();
    expect(screen.getByRole("button", { name: "Terminer le relevé" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("signale un recouvrement avec une autre parcelle sans bloquer", async () => {
    render(
      <SurveyForm
        userId="u1"
        farm={{ id: "f1" }}
        parcel={PARCEL}
        otherContours={[
          {
            code: "BJ-P-000002",
            ring: [
              { lng: 1.6005, lat: 9.0005 },
              { lng: 1.6015, lat: 9.0005 },
              { lng: 1.6015, lat: 9.0015 },
              { lng: 1.6005, lat: 9.0015 },
            ],
          },
        ]}
        captureCorner={corners([
          [1.6, 9],
          [1.601, 9],
          [1.601, 9.001],
          [1.6, 9.001],
        ])}
      />,
    );
    await mark(4);
    expect(screen.getByText("Recouvre une autre parcelle")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Terminer le relevé" })).toHaveProperty(
      "disabled",
      false,
    );
  });
});
