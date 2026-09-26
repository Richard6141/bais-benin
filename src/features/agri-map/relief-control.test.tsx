import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { isLowEndDevice } from "./map-config";
import { ReliefControl } from "./relief-control";

describe("relief 3D", () => {
  it("bascule le relief et signale une coupure automatique", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ReliefControl checked={false} slowNotice={false} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("status")).toBeNull();
    rerender(<ReliefControl checked={false} slowNotice onChange={onChange} />);
    expect(screen.getByRole("status")).toHaveTextContent("Relief coupé");
  });

  it("repère les appareils modestes", () => {
    expect(isLowEndDevice({ deviceMemory: 2 })).toBe(true);
    expect(isLowEndDevice({ hardwareConcurrency: 2 })).toBe(true);
    expect(isLowEndDevice({ saveData: true })).toBe(true);
    expect(isLowEndDevice({ deviceMemory: 8, hardwareConcurrency: 8 })).toBe(false);
    expect(isLowEndDevice({})).toBe(false);
  });
});
