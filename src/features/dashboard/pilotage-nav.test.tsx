import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const push = vi.fn();
let pathname = "/pilotage";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));

// La fenêtre d'avis appelle une action serveur : simulée ici.
vi.mock("@/features/feedback/actions", () => ({ submitFeedbackAction: vi.fn() }));

import { isActiveEntry, PilotageNav } from "./pilotage-nav";

describe("isActiveEntry", () => {
  it("distingue la vue nationale de sa fiche des autres rubriques", () => {
    expect(isActiveEntry("/pilotage", ["/pilotage", "/pilotage/fiche"])).toBe(true);
    expect(isActiveEntry("/pilotage/fiche", ["/pilotage", "/pilotage/fiche"])).toBe(true);
    expect(isActiveEntry("/pilotage/veille", ["/pilotage", "/pilotage/fiche"])).toBe(false);
  });

  it("reconnaît une sous-page par préfixe", () => {
    expect(
      isActiveEntry("/pilotage/communes/BJ-ATL-001", [
        "/pilotage/territoires",
        "/pilotage/communes",
      ]),
    ).toBe(true);
  });
});

describe("PilotageNav", () => {
  it("tient sur une seule rangée par niveau, sans rubrique cachée", () => {
    pathname = "/pilotage";
    render(<PilotageNav />);
    // Les quatre thèmes sont des liens ordinaires (navigation clavier native), jamais un menu qui
    // en cacherait un derrière un défilement.
    for (const theme of ["Situation", "Cultures", "Producteurs", "Administration"]) {
      expect(screen.getByRole("link", { name: theme })).toBeInTheDocument();
    }
  });

  it("marque le thème et l'entrée actifs pour la vue nationale", () => {
    pathname = "/pilotage";
    render(<PilotageNav />);
    expect(screen.getByRole("link", { name: "Situation" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Vue nationale" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.queryByRole("link", { name: "État des cultures" })).not.toBeInTheDocument();
  });

  it("bascule le sous-menu affiché selon le thème actif", () => {
    pathname = "/pilotage/previsions";
    render(<PilotageNav />);
    expect(screen.getByRole("link", { name: "Cultures" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Prévisions" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.queryByRole("link", { name: "Vue nationale" })).not.toBeInTheDocument();
  });

  it("garde une rubrique par préfixe (fiche d'une commune) sous Territoires", () => {
    pathname = "/pilotage/communes/BJ-ATL-001";
    render(<PilotageNav />);
    expect(screen.getByRole("link", { name: "Territoires" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("propose une liste unique des rubriques, groupées par thème, pour les petits écrans", () => {
    pathname = "/pilotage/groupes";
    render(<PilotageNav />);
    const select = screen.getByRole("combobox", { name: "Rubrique du pilotage" });
    expect(select).toHaveValue("/pilotage/groupes");
    const groups = Array.from(select.querySelectorAll("optgroup")).map((group) => group.label);
    expect(groups).toEqual(["Situation", "Cultures", "Producteurs", "Administration"]);
    expect(select.querySelectorAll("option")).toHaveLength(17);
  });
});
