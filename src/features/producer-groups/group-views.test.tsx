import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProducerGroupMemberRow } from "@/modules/producer-groups";
import { GroupFigures, GroupMembersTable, GroupMessages } from "./group-views";

const FORBIDDEN_MARKS = /[·…—]/;

const member = (overrides: Partial<ProducerGroupMemberRow>): ProducerGroupMemberRow => ({
  rank: 1,
  farmerId: "019284a0-0000-7000-8000-00000000a001",
  farmerCode: "PRD-000001",
  farmerName: "Awa Bio",
  phone: null,
  communeName: "Kandi",
  departementName: "Alibori",
  areaHa: 2,
  productionT: 4.2,
  yieldTPerHa: 2.1,
  verified: true,
  whatsappConsent: true,
  demo: true,
  parcelId: "019284a0-0000-7000-8000-00000000b001",
  ...overrides,
});

describe("fiche d'un groupe", () => {
  it("mène chaque membre à son champ sur la carte", () => {
    render(
      <GroupMembersTable
        byYield={false}
        members={[
          member({}),
          member({
            rank: 2,
            farmerId: "019284a0-0000-7000-8000-00000000a002",
            farmerName: "Koffi Dossou",
            yieldTPerHa: null,
            verified: false,
            whatsappConsent: false,
            parcelId: null,
          }),
        ]}
      />,
    );
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]!).getByRole("link", { name: "Voir le champ" })).toHaveAttribute(
      "href",
      "/carte?parcelle=019284a0-0000-7000-8000-00000000b001",
    );
    expect(within(rows[1]!).getByText("Oui")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Non calculé")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Déclarée")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Aucune parcelle")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(FORBIDDEN_MARKS);
  });

  it("donne production, rendement moyen et part des accords WhatsApp", () => {
    render(
      <GroupFigures
        figures={{
          members: 20,
          productionT: 312.44,
          areaHa: 150,
          meanYieldTPerHa: 2.083,
          consented: 11,
          demo: 11,
        }}
      />,
    );
    expect(screen.getByText("312,4 t")).toBeInTheDocument();
    expect(screen.getByText("2,08 t/ha")).toBeInTheDocument();
    expect(screen.getByText(/^55\s%$/)).toBeInTheDocument();
    expect(screen.getByText("11 sur 20")).toBeInTheDocument();
  });

  it("résume l'envoi de chaque message", () => {
    render(
      <GroupMessages
        messages={[
          {
            id: "m1",
            text: "Réunion lundi à Kandi.",
            createdAt: new Date("2026-09-25T09:05:00Z"),
            sentByName: "Direction de la production",
            recipients: 11,
            sent: 0,
            pending: 0,
            notSent: 11,
          },
        ]}
      />,
    );
    expect(screen.getByText("Réunion lundi à Kandi.")).toBeInTheDocument();
    expect(
      screen.getByText("11 destinataires : envoyés 0, en attente 0, non envoyés 11"),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(FORBIDDEN_MARKS);
  });
});
