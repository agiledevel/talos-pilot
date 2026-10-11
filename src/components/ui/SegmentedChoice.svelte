<!--
@component
A labelled single-choice control for a small fixed set of options, rendered as
a Skeleton segmented control with radio-group semantics.

The component is controlled: it reports the requested option through
`onChange` and shows `value`. The user's click toggles the native radio input
before the owner decides, and the inputs resynchronise only when `value`
changes. An owner that may reject a request must therefore show it in `value`
while deciding and restore the previous value to reject it.
-->
<script lang="ts" generics="Value extends string">
  import { SegmentedControl } from "@skeletonlabs/skeleton-svelte";

  interface Props {
    /** Visible label, also the accessible name of the radio group. */
    label: string;
    /** Options in display order. */
    options: readonly { readonly value: Value; readonly label: string }[];
    /** Currently accepted option. */
    value: Value;
    /** Prevents interaction with every option. */
    disabled?: boolean;
    /** Id of an element describing the control, such as a save error. */
    describedBy?: string | undefined;
    /** Called with the option the user requested. */
    onChange: (value: Value) => void;
  }

  let { label, options, value, disabled = false, describedBy, onChange }: Props = $props();

  // The underlying control reports a plain string; only a declared option is forwarded.
  function requestOption(next: string | null): void {
    const option = options.find((candidate) => candidate.value === next);
    if (option !== undefined) {
      onChange(option.value);
    }
  }
</script>

<SegmentedControl
  class="flex-row items-center max-sm:flex-col max-sm:items-start"
  {value}
  {disabled}
  aria-describedby={describedBy}
  onValueChange={(details) => requestOption(details.value)}
>
  <SegmentedControl.Label>{label}</SegmentedControl.Label>
  <SegmentedControl.Control class="p-1">
    <SegmentedControl.Indicator />
    {#each options as option (option.value)}
      <SegmentedControl.Item value={option.value}>
        <SegmentedControl.ItemText>{option.label}</SegmentedControl.ItemText>
        <SegmentedControl.ItemHiddenInput />
      </SegmentedControl.Item>
    {/each}
  </SegmentedControl.Control>
</SegmentedControl>
