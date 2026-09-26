import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { FirstStepsCard } from "./first-steps-card";

const KEY = "bais:premiers-pas:v1:producteur:u1";

describe("FirstStepsCard", () => {
  afterEach(() => window.localStorage.clear());

  it("montre la progression gardée sur l'appareil et ouvre chaque étape avec sa mise en évidence", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ done: ["champs"], hidden: false }));
    render(<FirstStepsCard role="producteur" userId="u1" />);
    expect(screen.getByText("1 étape sur 6")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByRole("link", { name: /Voir mes champs, fait/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Déclarer une récolte, à faire/ })).toHaveAttribute(
      "href",
      "/agriculteur/recolte?pas=recolte",
    );
  });

  it("se masque, puis se rouvre, sans rien perdre", async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ done: ["champs"], hidden: false }));
    render(<FirstStepsCard role="producteur" userId="u1" />);
    await userEvent.click(screen.getByRole("button", { name: "Masquer" }));
    expect(screen.queryByRole("heading", { name: "Premiers pas" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Afficher les premiers pas" }));
    expect(screen.getByText("1 étape sur 6")).toBeInTheDocument();
  });

  it("se réduit à une ligne quand le parcours est fait, et propose de recommencer", async () => {
    const all = ["champs", "alertes", "recolte", "signaler", "aide", "attestation"];
    window.localStorage.setItem(KEY, JSON.stringify({ done: all, hidden: false }));
    render(<FirstStepsCard role="producteur" userId="u1" />);
    expect(screen.getByText(/Premiers pas terminés/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Recommencer le parcours" }));
    expect(screen.getByText("0 étape sur 6")).toBeInTheDocument();
  });
});
