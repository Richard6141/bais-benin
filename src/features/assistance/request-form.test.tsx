import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAgentDatabase } from "@/lib/offline/db";
import { assistanceRequestPayload } from "@/modules/sync/commands";
import { RequestForm } from "./request-form";
import { formatDelay } from "./stats-table";

const USER_ID = "01923456-0000-7000-8000-00000000a002";
const context = {
  farms: [
    {
      id: "01923456-0000-7000-8000-00000000b002",
      label: "Champ de Kpayérou",
      communeName: "Djougou",
    },
  ],
  communes: [
    { code: "BJ-DON-003", name: "Djougou" },
    { code: "BJ-BOR-005", name: "Parakou" },
  ],
  defaultCommuneCode: "BJ-DON-003",
};

describe("RequestForm", () => {
  afterEach(async () => {
    await getAgentDatabase(USER_ID).outbox.clear();
    vi.unstubAllGlobals();
  });

  it("exige l'objet de la demande et une description", async () => {
    render(<RequestForm userId={USER_ID} context={context} />);
    fireEvent.click(screen.getByRole("button", { name: "Envoyer ma demande" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choisissez l'objet");
    fireEvent.click(screen.getByRole("button", { name: /Intrants/ }));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer ma demande" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Décrivez votre demande");
  });

  it("met une demande sans exploitation dans la file, pour la commune du producteur", async () => {
    vi.stubGlobal("navigator", { ...navigator, onLine: false });
    render(<RequestForm userId={USER_ID} context={context} />);
    fireEvent.click(screen.getByRole("button", { name: /Conseil/ }));
    fireEvent.change(screen.getByLabelText("Exploitation concernée"), { target: { value: "" } });
    // Commune de la fiche producteur, affichée et non choisie.
    expect(screen.queryByLabelText("Votre commune")).toBeNull();
    expect(screen.getByText("Djougou")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Votre demande"), {
      target: { value: "Quand semer le niébé cette année ?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer ma demande" }));

    expect(await screen.findByText("Demande enregistrée")).toBeInTheDocument();
    await waitFor(async () => {
      expect(await getAgentDatabase(USER_ID).outbox.count()).toBe(1);
    });
    const [entry] = await getAgentDatabase(USER_ID).outbox.toArray();
    expect(entry?.type).toBe("assistance.request");
    expect(assistanceRequestPayload.parse(entry?.payload)).toMatchObject({
      category: "ADVICE",
      communeCode: "BJ-DON-003",
    });
  });
});

describe("formatDelay", () => {
  it("parle en heures sous deux jours, en jours au-delà", () => {
    expect(formatDelay(null)).toBe("n.d.");
    expect(formatDelay(5.25)).toBe("5,3 h");
    expect(formatDelay(72)).toBe("3 j");
  });
});
