import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listThresholds } from "@/modules/monitoring/rule-admin/thresholds";
import type { RuleNode } from "@/modules/monitoring/rules";

// Actions serveur remplacées : on vérifie ce que l'éditeur leur envoie.
const actions = vi.hoisted(() => ({
  createRuleVersionAction: vi.fn(),
  simulateRuleAction: vi.fn(),
}));
vi.mock("./actions", () => actions);

const { RuleDefinitionEditor } = await import("./rule-definition-editor");

const LABEL = "Pluie prévue sur les 3 prochains jours";

function ruleAt(version: number, value: number) {
  const definition: RuleNode = { indicator: "forecast_rain_sum_3d", op: ">=", value };
  return {
    code: "HEAVY_RAIN_FORECAST",
    version,
    definition,
    thresholds: listThresholds(definition),
    messageShort: "BAIS {commune} : fortes pluies prévues, {forecast_rain_sum_3d} mm en 3 jours.",
    adviceFr: "Dégagez les rigoles et mettez les récoltes à l'abri.",
    cooldownHours: 48,
  };
}

function editor(rule: ReturnType<typeof ruleAt>) {
  return (
    <RuleDefinitionEditor
      rule={rule}
      previewCommune="Djougou"
      simulationFrom="2026-08-26"
      simulationTo="2026-09-24"
    />
  );
}

describe("éditeur de règle", () => {
  beforeEach(() => {
    actions.createRuleVersionAction.mockReset();
    actions.simulateRuleAction.mockReset();
  });

  it("garde la version éditée comme référence quand la page se rafraîchit pendant la saisie", async () => {
    // Défaut corrigé : la page, rafraîchie avec une version 2 qui a déjà la valeur saisie, faisait
    // paraître le brouillon inchangé et l'enregistrement répondait « Aucune modification ».
    actions.createRuleVersionAction.mockResolvedValue({
      ok: false,
      message: "La règle a été modifiée entre-temps : la version 2 est désormais en vigueur.",
    });
    const { rerender } = render(editor(ruleAt(1, 80)));
    fireEvent.change(screen.getByLabelText(LABEL), { target: { value: "70" } });
    rerender(editor(ruleAt(2, 70)));

    expect(screen.getByText("Version plus récente disponible")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la version 2" }));
    await waitFor(() => expect(actions.createRuleVersionAction).toHaveBeenCalledTimes(1));
    expect(actions.createRuleVersionAction).toHaveBeenCalledWith(
      "HEAVY_RAIN_FORECAST",
      expect.objectContaining({ thresholds: { racine: 70 }, baseVersion: 1 }),
    );
    expect(await screen.findByText(/modifiée entre-temps/)).toBeInTheDocument();
  });

  it("part de la version enregistrée pour la modification suivante", async () => {
    actions.createRuleVersionAction
      .mockResolvedValueOnce({ ok: true, data: { version: 2 } })
      .mockResolvedValueOnce({ ok: true, data: { version: 3 } });
    render(editor(ruleAt(1, 80)));
    const field = screen.getByLabelText(LABEL);

    fireEvent.change(field, { target: { value: "70" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enregistrer la version 2" }));
    });
    expect(await screen.findByText("Version 2 enregistrée et activée.")).toBeInTheDocument();

    fireEvent.change(field, { target: { value: "75" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enregistrer la version 3" }));
    });
    expect(actions.createRuleVersionAction).toHaveBeenLastCalledWith(
      "HEAVY_RAIN_FORECAST",
      expect.objectContaining({ thresholds: { racine: 75 }, baseVersion: 2 }),
    );
  });
});
