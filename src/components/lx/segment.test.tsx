import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Segment } from "./Segment";

describe("Segment", () => {
  it("marks the active item and reports clicks on the other", () => {
    const onChange = vi.fn();
    render(
      <Segment
        ariaLabel="Game mode"
        value="softcore"
        onChange={onChange}
        items={[
          { value: "softcore", label: "Softcore" },
          { value: "hardcore", label: "Hardcore" },
        ]}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Softcore" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Hardcore" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Hardcore" }));
    expect(onChange).toHaveBeenCalledWith("hardcore");
  });
});
