import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import SelectField from "./SelectField.svelte";

const OPTIONS = [
  { value: "10.79.0.4", label: "10.79.0.4" },
  { value: "10.79.0.5", label: "10.79.0.5" },
  { value: "10.79.0.6", label: "10.79.0.6" },
] as const;

function trigger(): HTMLElement {
  return screen.getByRole("combobox", { name: "Talos node target" });
}

/*
 * The option list is positioned by measuring layout, which jsdom does not
 * perform, so it stays `visibility: hidden` here. Queries for the list include
 * hidden elements, and options are found by their text because a hidden
 * element has no computed accessible name. A real browser shows them.
 */
const POSITIONED_BY_LAYOUT = { hidden: true } as const;

async function findOption(label: string): Promise<HTMLElement> {
  return await screen.findByText(label, { selector: "[role='option']" });
}

function renderField(overrides: { readonly disabled?: boolean } = {}) {
  const onChange = vi.fn<(value: string) => void>();
  const view = render(SelectField, {
    props: {
      label: "Talos node target",
      options: OPTIONS,
      value: "10.79.0.4",
      onChange,
      ...overrides,
    },
  });
  return { onChange, view };
}

describe("select field", () => {
  it("names the trigger from its label and shows the selected option while the list is closed", () => {
    renderField();
    expect(trigger()).toHaveTextContent("10.79.0.4");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox", POSITIONED_BY_LAYOUT)).not.toBeInTheDocument();
  });

  it("reports the option chosen with the pointer and stays controlled by its owner", async () => {
    const user = userEvent.setup();
    const { onChange, view } = renderField();

    await user.click(trigger());
    await user.click(await findOption("10.79.0.5"));

    expect(onChange).toHaveBeenCalledExactlyOnceWith("10.79.0.5");
    expect(trigger()).toHaveTextContent("10.79.0.4");

    await view.rerender({ value: "10.79.0.5" });
    expect(trigger()).toHaveTextContent("10.79.0.5");
  });

  it("supports choosing an option from the keyboard", async () => {
    const user = userEvent.setup();
    const { onChange } = renderField();

    trigger().focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("listbox", POSITIONED_BY_LAYOUT);
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledExactlyOnceWith("10.79.0.5");
  });

  it("closes without a change when the list is dismissed", async () => {
    const user = userEvent.setup();
    const { onChange } = renderField();

    await user.click(trigger());
    await screen.findByRole("listbox", POSITIONED_BY_LAYOUT);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox", POSITIONED_BY_LAYOUT)).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not open while disabled", async () => {
    const user = userEvent.setup();
    const { onChange } = renderField({ disabled: true });

    expect(trigger()).toBeDisabled();
    await user.click(trigger());

    expect(screen.queryByRole("listbox", POSITIONED_BY_LAYOUT)).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
