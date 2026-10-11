<!--
@component
A themed single-value picker built on the headless Bits UI `Select` and styled
with Skeleton tokens. It replaces the native `<select>` popup, which the system
WebViews draw outside the application theme.

The component is controlled: `onChange` receives the chosen value and the
trigger keeps showing `value`. The trigger follows the select-only combobox
pattern: the visible label names it and the selected option is its value. The
option list renders next to the trigger rather than in a body portal, so it
stays inside the surrounding landmark and reading order. It closes on selection
or Escape.
-->
<script lang="ts">
  import { Select } from "bits-ui";

  interface Props {
    /** Visible label and accessible name of the trigger. */
    label: string;
    /** Options in display order; values must be unique. */
    options: readonly { readonly value: string; readonly label: string }[];
    /** Currently selected option value. */
    value: string;
    /** Prevents opening the list or changing the value. */
    disabled?: boolean;
    /** Called with the value the user selected. */
    onChange: (value: string) => void;
  }

  let { label, options, value, disabled = false, onChange }: Props = $props();

  const uid = $props.id();
  const labelId = `${uid}-label`;
  const listId = `${uid}-list`;

  const selectedLabel = $derived(options.find((option) => option.value === value)?.label ?? "");
</script>

<div class="grid gap-1">
  <span id={labelId} class="label-text">{label}</span>
  <Select.Root type="single" {disabled} items={[...options]} bind:value={() => value, onChange}>
    <Select.Trigger
      role="combobox"
      aria-labelledby={labelId}
      aria-controls={listId}
      class="flex w-full items-center justify-between gap-3 rounded-base bg-surface-50-950 px-3 py-2 text-left ring-1 ring-surface-300-700 ring-inset"
    >
      <span class="truncate">{selectedLabel}</span>
      <span aria-hidden="true" class="text-surface-700-300">▾</span>
    </Select.Trigger>
    <Select.Content
      id={listId}
      aria-labelledby={labelId}
      sideOffset={4}
      class="z-50 max-h-64 w-(--bits-select-anchor-width) overflow-y-auto card border border-surface-200-800 bg-surface-50-950 p-1 shadow-lg"
    >
      <Select.Viewport>
        {#each options as option (option.value)}
          <Select.Item
            value={option.value}
            label={option.label}
            class="flex cursor-default items-center rounded-base px-3 py-2 outline-none select-none data-highlighted:preset-tonal-primary data-selected:font-semibold"
          >
            {option.label}
          </Select.Item>
        {/each}
      </Select.Viewport>
    </Select.Content>
  </Select.Root>
</div>
