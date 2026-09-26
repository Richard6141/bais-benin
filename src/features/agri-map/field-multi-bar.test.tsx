import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FieldMultiBar } from "./field-multi-bar";

const noop = () => {};

describe("sélection des champs", () => {
  it("bascule vers plusieurs champs et revient à un seul champ", () => {
    const onMode = vi.fn();
    const { rerender } = render(
      <FieldMultiBar
        mode="single"
        count={0}
        cutPoints={0}
        onMode={onMode}
        onAttribute={noop}
        onClear={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Plusieurs champs" }));
    expect(onMode).toHaveBeenLastCalledWith("multiple");
    expect(screen.queryByRole("button", { name: /Attribuer/ })).toBeNull();

    const onAttribute = vi.fn();
    rerender(
      <FieldMultiBar
        mode="multiple"
        count={3}
        cutPoints={0}
        onMode={onMode}
        onAttribute={onAttribute}
        onClear={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Attribuer 3 champs" }));
    expect(onAttribute).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Plusieurs champs" }));
    expect(onMode).toHaveBeenLastCalledWith("single");
  });

  it("guide les deux touchers de la ligne de coupe", () => {
    const onMode = vi.fn();
    const { rerender } = render(
      <FieldMultiBar
        mode="single"
        count={0}
        cutPoints={0}
        onMode={onMode}
        onAttribute={noop}
        onClear={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Diviser un champ" }));
    expect(onMode).toHaveBeenLastCalledWith("split");
    rerender(
      <FieldMultiBar
        mode="split"
        count={1}
        cutPoints={0}
        onMode={onMode}
        onAttribute={noop}
        onClear={noop}
      />,
    );
    expect(screen.getByText("Touchez le premier point de coupe")).toBeInTheDocument();
    rerender(
      <FieldMultiBar
        mode="split"
        count={1}
        cutPoints={1}
        onMode={onMode}
        onAttribute={noop}
        onClear={noop}
      />,
    );
    expect(screen.getByText("Touchez le second point de coupe")).toBeInTheDocument();
  });
});
