<!--
@component
A desktop menu bar built on the headless Bits UI `Menubar` and styled with
Skeleton tokens. Each menu holds single-choice groups rendered as radio items.

The bar follows the ARIA menubar pattern: Left and Right move between menus,
Enter, Space, or Down opens one, Up and Down move between its items, and
Escape closes it and returns focus to its trigger. Choosing an item closes the
menu. A disabled menu still opens, so its current choices stay readable.

Every group is controlled through its `value` and `onChange`; see
`MenuChoiceGroup`. Menu content renders next to its trigger rather than in a
body portal, so it stays inside the surrounding landmark.
-->
<script lang="ts">
  import { Menubar } from "bits-ui";
  import type { MenuDefinition } from "./menu";

  interface Props {
    /** Accessible name of the menu bar. */
    label: string;
    /** Menus in display order. */
    menus: readonly MenuDefinition[];
  }

  let { label, menus }: Props = $props();
</script>

<Menubar.Root aria-label={label} class="flex items-center gap-1 px-2 py-1">
  {#each menus as menu (menu.label)}
    <Menubar.Menu>
      <Menubar.Trigger
        aria-describedby={menu.describedBy}
        class="cursor-default rounded-base px-2 py-0.5 select-none hover:preset-tonal data-highlighted:preset-tonal data-[state=open]:preset-tonal"
      >
        {menu.label}
      </Menubar.Trigger>
      <Menubar.Content
        align="start"
        sideOffset={4}
        class="z-50 min-w-48 card border border-surface-200-800 bg-surface-50-950 p-1 shadow-lg"
      >
        {#each menu.groups as group, index (group.label)}
          {#if index > 0}
            <Menubar.Separator class="my-1 border-t border-surface-200-800" />
          {/if}
          <Menubar.RadioGroup bind:value={() => group.value, group.onChange}>
            <Menubar.GroupHeading class="px-3 py-1 text-xs text-surface-700-300">
              {group.label}
            </Menubar.GroupHeading>
            {#each group.options as option (option.value)}
              <Menubar.RadioItem
                value={option.value}
                disabled={menu.disabled ?? false}
                class="flex cursor-default items-center gap-2 rounded-base px-3 py-1 outline-none select-none data-disabled:opacity-60 data-highlighted:preset-tonal-primary"
              >
                {#snippet children({ checked })}
                  <span aria-hidden="true" class="w-4 text-center">{checked ? "✓" : ""}</span>
                  {option.label}
                {/snippet}
              </Menubar.RadioItem>
            {/each}
          </Menubar.RadioGroup>
        {/each}
      </Menubar.Content>
    </Menubar.Menu>
  {/each}
</Menubar.Root>
