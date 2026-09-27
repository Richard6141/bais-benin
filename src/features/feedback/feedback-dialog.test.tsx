import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const submit = vi.fn(async () => ({ status: "success" as const }));
vi.mock("./actions", () => ({ submitFeedbackAction: () => submit() }));

import { FeedbackDialog } from "./feedback-dialog";

// Fenêtre « Donner mon avis » (chantier J) : envoi possible seulement avec un type et un message,
// page et type d'écran ajoutés sans être montrés, accusé de réception puis retour à la page.

describe("donner mon avis", () => {
  it("n'envoie qu'avec un type et un message, et ajoute page et écran", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/agent/exploitations?page=2");
    render(<FeedbackDialog open onOpenChange={() => {}} />);
    const send = screen.getByRole("button", { name: "Envoyer" });
    expect(send).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Une idée" }));
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText("Votre message"), "Ajouter un tri par commune");
    expect(send).toBeEnabled();
    expect(screen.getByText(/26 sur 1\s000/)).toBeInTheDocument();
    const form = send.closest("form")!;
    expect((form.querySelector('input[name="pagePath"]') as HTMLInputElement).value).toBe(
      "/agent/exploitations",
    );
    expect((form.querySelector('input[name="kind"]') as HTMLInputElement).value).toBe("IDEA");
    expect(["MOBILE", "DESKTOP"]).toContain(
      (form.querySelector('input[name="device"]') as HTMLInputElement).value,
    );
    expect(document.body.textContent).not.toMatch(/[·…—]/);
  });

  it("dit merci après l'envoi, puis ramène à la page", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<FeedbackDialog open onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("button", { name: "Quelque chose ne marche pas" }));
    await user.click(screen.getByRole("button", { name: "4 sur 5" }));
    await user.type(screen.getByLabelText("Votre message"), "La carte ne charge pas");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() =>
      expect(screen.getByText("Merci, votre avis est bien reçu")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Revenir à la page" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
