import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FieldMultiBar } from "./field-multi-bar";

const noop = () => {};

describe("sélection de plusieurs champs", () => {
  it("bascule le mode et n'offre l'attribution qu'avec une sélection", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <FieldMultiBar
        multiple={false}
        count={0}
        onToggle={onToggle}
        onAttribute={noop}
        onClear={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Plusieurs champs" }));
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("button", { name: /Attribuer/ })).toBeNull();

    const onAttribute = vi.fn();
    rerender(
      <FieldMultiBar
        multiple
        count={3}
        onToggle={onToggle}
        onAttribute={onAttribute}
        onClear={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Attribuer 3 champs" }));
    expect(onAttribute).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Plusieurs champs" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
