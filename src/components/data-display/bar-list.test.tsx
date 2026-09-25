import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BarList } from "./bar-list";

describe("BarList", () => {
  it("écrit chaque valeur en clair et explique le secret statistique", () => {
    render(
      <TooltipProvider>
        <BarList
          label="Production par culture"
          items={[
            { key: "maize", label: "Maïs", value: 120, display: "120 t" },
            { key: "rice", label: "Riz", value: null, emptyLabel: "récolte non déclarée" },
            { key: "yam", label: "Igname", value: "masked" },
          ]}
        />
      </TooltipProvider>,
    );
    const list = screen.getByRole("list", { name: "Production par culture" });
    expect(list.querySelectorAll("li")).toHaveLength(3);
    expect(screen.getByText("120 t")).toBeInTheDocument();
    expect(screen.getByText("récolte non déclarée")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /moins de 5\. Secret statistique/ }),
    ).toBeInTheDocument();
  });
});
