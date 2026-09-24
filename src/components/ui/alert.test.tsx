import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Alert, AlertDescription, AlertTitle } from "./alert";

describe("Alert", () => {
  it("est annoncée comme alerte et porte sa variante", () => {
    render(
      <Alert variant="warning">
        <AlertTitle>Alerte hydrique</AlertTitle>
        <AlertDescription>Absence de pluie depuis dix jours.</AlertDescription>
      </Alert>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("data-variant", "warning");
    expect(alert).toHaveTextContent("Alerte hydrique");
  });

  it("utilise la variante par défaut quand aucune n'est donnée", () => {
    render(<Alert>Information</Alert>);
    expect(screen.getByRole("alert")).toHaveAttribute("data-variant", "default");
  });
});
