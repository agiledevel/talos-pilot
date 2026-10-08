import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PilotApp } from "./PilotApp";

describe("appearance preferences", () => {
  it("allows keyboard theme changes and keeps density independent", async () => {
    const user = userEvent.setup();
    render(<PilotApp />);
    const dark = screen.getByRole("switch", { name: "Dark theme" });
    const compact = screen.getByRole("switch", { name: "Compact density" });
    await user.tab();
    expect(dark).toHaveFocus();
    await user.keyboard(" ");
    expect(dark).toBeChecked();
    expect(compact).not.toBeChecked();
    await user.tab();
    await user.keyboard(" ");
    expect(compact).toBeChecked();
    expect(dark).toBeChecked();
  });
});
