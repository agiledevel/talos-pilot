import { describe, expect, it, vi } from "vitest";
import { menuChoiceGroup } from "./menu";

const OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

describe("menu choice group", () => {
  it("forwards a declared option to its owner with the owner's value type", () => {
    const onChange = vi.fn<(value: "light" | "dark") => void>();
    const group = menuChoiceGroup({ label: "Theme", options: OPTIONS, value: "light", onChange });

    group.onChange("dark");

    expect(onChange).toHaveBeenCalledExactlyOnceWith("dark");
    expect(group).toMatchObject({ label: "Theme", options: OPTIONS, value: "light" });
  });

  it("drops a value that is not one of the declared options", () => {
    const onChange = vi.fn<(value: "light" | "dark") => void>();
    const group = menuChoiceGroup({ label: "Theme", options: OPTIONS, value: "light", onChange });

    group.onChange("sepia");
    group.onChange("");

    expect(onChange).not.toHaveBeenCalled();
  });
});
