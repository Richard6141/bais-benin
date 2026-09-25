import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SortableTable, type SortableRow } from "./sortable-table";

const rows: SortableRow[] = [
  {
    key: "a",
    cells: { name: { display: "Alibori", sort: "Alibori" }, farms: { display: "40", sort: 40 } },
  },
  {
    key: "b",
    cells: {
      name: { display: "Borgou", sort: "Borgou" },
      farms: { display: "moins de 5", sort: null },
    },
  },
  {
    key: "c",
    cells: { name: { display: "Collines", sort: "Collines" }, farms: { display: "90", sort: 90 } },
  },
];

const columns = [
  { key: "name", label: "Département" },
  { key: "farms", label: "Exploitations", align: "right" as const },
];

const bodyNames = () =>
  within(screen.getAllByRole("rowgroup")[1]!)
    .getAllByRole("row")
    .map((row) => within(row).getAllByRole("cell")[1]?.textContent);

describe("SortableTable", () => {
  it("annonce le tri par aria-sort et bascule le sens au clic", () => {
    render(
      <SortableTable
        caption="Départements"
        columns={columns}
        rows={rows}
        initialSort={{ key: "farms", direction: "descending" }}
        ranked
      />,
    );
    const header = screen.getByRole("columnheader", { name: /Exploitations/ });
    expect(header).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByRole("columnheader", { name: /Département/ })).toHaveAttribute(
      "aria-sort",
      "none",
    );
    expect(bodyNames()).toEqual(["Collines", "Alibori", "Borgou"]);
    fireEvent.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "ascending");
    // La valeur masquée reste en bas dans les deux sens.
    expect(bodyNames()).toEqual(["Alibori", "Collines", "Borgou"]);
  });

  it("ne classe pas une ligne masquée", () => {
    render(
      <SortableTable
        caption="Départements"
        columns={columns}
        rows={rows}
        initialSort={{ key: "farms", direction: "descending" }}
        ranked
      />,
    );
    const ranks = within(screen.getAllByRole("rowgroup")[1]!)
      .getAllByRole("row")
      .map((row) => within(row).getAllByRole("cell")[0]?.textContent);
    expect(ranks).toEqual(["1", "2", ""]);
  });
});
