import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { PageTabs } from "./page-tabs";

const TABS = [
  { value: "production", label: "Production", content: <p>Vue production</p> },
  { value: "alertes", label: "Alertes", count: 3, content: <p>Vue alertes</p> },
];

describe("PageTabs", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("ouvre le premier onglet par défaut et une seule vue à la fois", () => {
    render(<PageTabs label="Vues" tabs={TABS} />);
    expect(screen.getByText("Vue production")).toBeInTheDocument();
    expect(screen.queryByText("Vue alertes")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Alertes/ })).toHaveTextContent("3");
  });

  it("ouvre l'onglet demandé par l'adresse et garde le choix dans l'adresse", async () => {
    render(<PageTabs label="Vues" tabs={TABS} initial="alertes" />);
    expect(screen.getByText("Vue alertes")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Production" }));
    expect(screen.getByText("Vue production")).toBeInTheDocument();
    // Le premier onglet n'encombre pas l'adresse.
    expect(window.location.search).toBe("");
    await userEvent.click(screen.getByRole("tab", { name: /Alertes/ }));
    expect(window.location.search).toBe("?onglet=alertes");
  });

  it("ignore un onglet inconnu dans l'adresse", () => {
    render(<PageTabs label="Vues" tabs={TABS} initial="inconnu" />);
    expect(screen.getByText("Vue production")).toBeInTheDocument();
  });
});
