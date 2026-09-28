import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScopePicker } from "./scope-picker";

const TERRITORIES = [
  {
    id: "borgou",
    name: "Borgou",
    communes: [{ id: "parakou", name: "Parakou" }],
  },
  {
    id: "donga",
    name: "Donga",
    communes: [
      { id: "copargo", name: "Copargo" },
      { id: "djougou", name: "Djougou" },
    ],
  },
];

function hiddenValues(container: HTMLElement, name: string) {
  return Array.from(container.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)).map(
    (input) => input.value,
  );
}

describe("choix du périmètre d'un agent", () => {
  it("part du périmètre en place et ouvre son département", () => {
    const { container } = render(
      <ScopePicker territories={TERRITORIES} initialCommuneIds={["djougou"]} />,
    );
    expect(screen.getByRole("combobox", { name: "Département" })).toHaveValue("donga");
    expect(screen.getByRole("checkbox", { name: "Djougou" })).toBeChecked();
    expect(hiddenValues(container, "commune")).toEqual(["djougou"]);
  });

  it("garde les communes d'un autre département et les montre dans le récapitulatif", () => {
    const { container } = render(
      <ScopePicker territories={TERRITORIES} initialCommuneIds={["djougou"]} />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Département" }), {
      target: { value: "borgou" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Parakou" }));
    expect(hiddenValues(container, "commune").sort()).toEqual(["djougou", "parakou"]);
    expect(screen.getByRole("button", { name: "Retirer Djougou" })).toBeInTheDocument();
  });

  it("un département entier remplace ses communes cochées", () => {
    const { container } = render(
      <ScopePicker territories={TERRITORIES} initialCommuneIds={["djougou"]} />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Tout le département" }));
    expect(hiddenValues(container, "departement")).toEqual(["donga"]);
    expect(hiddenValues(container, "commune")).toEqual([]);
    expect(screen.getByRole("checkbox", { name: "Copargo" })).toBeDisabled();
  });

  it("retire un territoire depuis le récapitulatif", () => {
    const { container } = render(
      <ScopePicker territories={TERRITORIES} initialCommuneIds={["djougou", "copargo"]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retirer Copargo" }));
    expect(hiddenValues(container, "commune")).toEqual(["djougou"]);
  });
});
