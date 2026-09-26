import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BellRing, Home, LandPlot, LifeBuoy, PlusCircle, RefreshCw } from "lucide-react";
import type { Route } from "next";
import { describe, expect, it, vi } from "vitest";

let pathname = "/agent";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

import { isActiveItem, SpaceNav, type SpaceNavItem } from "./space-nav";

const ITEMS: SpaceNavItem[] = [
  { href: "/agent" as Route, label: "Accueil", icon: Home, exact: true, bar: true, top: true },
  {
    href: "/agent/exploitations" as Route,
    label: "Exploitations",
    icon: LandPlot,
    bar: true,
    top: true,
  },
  {
    href: "/agent/enregistrer" as Route,
    label: "Enregistrer",
    icon: PlusCircle,
    bar: true,
    top: true,
  },
  { href: "/agent/alertes" as Route, label: "Alertes", icon: BellRing, top: true },
  { href: "/agent/demandes" as Route, label: "Demandes", icon: LifeBuoy },
  { href: "/agent/synchronisation" as Route, label: "Synchronisation", icon: RefreshCw },
];

describe("isActiveItem", () => {
  it("ne confond pas l'accueil de l'espace avec ses sous-pages", () => {
    expect(isActiveItem("/agent", ITEMS[0]!)).toBe(true);
    expect(isActiveItem("/agent/alertes", ITEMS[0]!)).toBe(false);
  });

  it("active une liste pour ses fiches, jamais pour une adresse voisine", () => {
    expect(isActiveItem("/agent/exploitations/abc", ITEMS[1]!)).toBe(true);
    expect(isActiveItem("/agent/exploitations-archivees", ITEMS[1]!)).toBe(false);
  });
});

describe("SpaceNav", () => {
  it("garde toutes les rubriques atteignables sur téléphone, sous « Plus »", async () => {
    pathname = "/agent/demandes";
    render(<SpaceNav label="Espace agent" items={ITEMS} />);
    const [, bottom] = screen.getAllByRole("navigation", { name: "Espace agent" });
    // Barre basse : les rubriques marquées, puis « Plus », qui porte la page active.
    expect(
      within(bottom!)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Accueil", "Exploitations", "Enregistrer"]);
    await userEvent.click(within(bottom!).getByRole("button", { name: "Plus" }));
    const sheet = await screen.findByRole("dialog");
    expect(
      within(sheet)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Alertes", "Demandes", "Synchronisation"]);
    expect(within(sheet).getByRole("link", { name: "Demandes" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("montre en onglets les rubriques du haut et marque la page active", () => {
    pathname = "/agent/exploitations/abc";
    render(<SpaceNav label="Espace agent" items={ITEMS} />);
    const [top] = screen.getAllByRole("navigation", { name: "Espace agent" });
    expect(within(top!).getByRole("link", { name: "Exploitations" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(top!).queryByRole("link", { name: "Demandes" })).not.toBeInTheDocument();
    expect(within(top!).getByRole("button", { name: "Plus" })).toBeInTheDocument();
  });
});
