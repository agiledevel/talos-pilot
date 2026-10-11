<!--
@component
The status bar along the bottom edge of the window: a row of labelled context
items and an optional trailing note.

It states context in text only and is not a live region, so a view that
announces a change keeps doing so once. A value too long for its slot is
truncated and remains available as the item's tooltip.
-->
<script lang="ts" module>
  /** One labelled piece of context shown in the status bar. */
  export interface StatusBarItem {
    /** Short name of the context; unique within the bar. */
    readonly label: string;
    /** Current value in words; never secret material. */
    readonly value: string;
  }
</script>

<script lang="ts">
  interface Props {
    /** Accessible name of the status bar landmark. */
    label: string;
    /** Context items in display order. */
    items: readonly StatusBarItem[];
    /** Trailing note that does not change with context, such as the build stage. */
    note?: string | undefined;
  }

  let { label, items, note }: Props = $props();
</script>

<footer
  aria-label={label}
  class="flex items-center gap-4 border-t border-surface-200-800 bg-surface-100-900 px-3 py-1 text-sm"
>
  <dl class="flex min-w-0 flex-1 items-center gap-5">
    {#each items as item (item.label)}
      <div class="flex min-w-0 gap-1">
        <dt class="shrink-0 text-surface-700-300">{item.label}:</dt>
        <dd class="truncate" title={item.value}>{item.value}</dd>
      </div>
    {/each}
  </dl>
  {#if note !== undefined}
    <p class="shrink-0 text-surface-700-300">{note}</p>
  {/if}
</footer>
