import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAgentDatabase } from "@/lib/offline/db";
import { fieldReportCreatePayload } from "@/modules/sync/commands";
import { ReportForm } from "./report-form";

const USER_ID = "01923456-0000-7000-8000-00000000a001";
const farms = [
  {
    id: "01923456-0000-7000-8000-00000000b001",
    code: "BJ-DON-DJO-000001",
    name: "Champ de Kpayérou",
    village: "Kpayérou",
    parcels: [
      {
        id: "01923456-0000-7000-8000-00000000c001",
        code: "BJ-DON-DJO-000001-P01",
        areaHa: 1.5,
        cropCodes: ["MAIZE"],
      },
    ],
  },
];

describe("ReportForm", () => {
  afterEach(async () => {
    await getAgentDatabase(USER_ID).outbox.clear();
    vi.unstubAllGlobals();
  });

  it("exige le type de problème et une description", async () => {
    render(<ReportForm userId={USER_ID} farms={farms} cropNames={{ MAIZE: "Maïs" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le signalement" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choisissez le type de problème.");
    fireEvent.click(screen.getByRole("button", { name: /Ravageur/ }));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le signalement" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Décrivez le problème");
  });

  it("met le signalement dans la file de l'appareil, hors ligne, au bon contrat", async () => {
    vi.stubGlobal("navigator", { ...navigator, onLine: false });
    render(<ReportForm userId={USER_ID} farms={farms} cropNames={{ MAIZE: "Maïs" }} />);
    fireEvent.click(screen.getByRole("button", { name: /Ravageur/ }));
    fireEvent.click(screen.getByRole("button", { name: "Maïs" }));
    fireEvent.change(screen.getByLabelText("Ce que vous avez vu"), {
      target: { value: "Des chenilles mangent les feuilles du maïs" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le signalement" }));

    expect(await screen.findByText("Signalement enregistré")).toBeInTheDocument();
    await waitFor(async () => {
      const entries = await getAgentDatabase(USER_ID).outbox.toArray();
      expect(entries).toHaveLength(1);
    });
    const [entry] = await getAgentDatabase(USER_ID).outbox.toArray();
    expect(entry?.type).toBe("fieldReport.create");
    const payload = fieldReportCreatePayload.parse(entry?.payload);
    expect(payload).toMatchObject({
      farmId: farms[0]!.id,
      parcelId: farms[0]!.parcels[0]!.id,
      type: "PEST",
      cropCode: "MAIZE",
    });
    expect(payload.gps).toBeUndefined();
  });
});
