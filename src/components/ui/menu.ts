/** One option of a single-choice menu group. */
export interface MenuChoice {
  /** Value reported when the option is chosen; unique within its group. */
  readonly value: string;
  /** Visible label of the menu item. */
  readonly label: string;
}

/**
 * A single-choice group inside a menu, shown as radio items under a heading.
 *
 * The group is controlled: the menu shows `value` and reports the requested
 * option through `onChange`. An owner that may reject a request shows it in
 * `value` while deciding and restores the previous value to reject it.
 */
export interface MenuChoiceGroup {
  /** Heading and accessible name of the group; unique within its menu. */
  readonly label: string;
  /** Options in display order. */
  readonly options: readonly MenuChoice[];
  /** Currently selected option value. */
  readonly value: string;
  /** Called with the option value the user requested. */
  readonly onChange: (value: string) => void;
}

/** One menu of a menu bar. */
export interface MenuDefinition {
  /** Visible label of the menu trigger; unique within the menu bar. */
  readonly label: string;
  /** Choice groups in display order, separated by a rule. */
  readonly groups: readonly MenuChoiceGroup[];
  /** Keeps the menu readable but prevents choosing any item. */
  readonly disabled?: boolean;
  /** Id of an element describing the menu, such as a save error. */
  readonly describedBy?: string | undefined;
}

/**
 * Builds a {@link MenuChoiceGroup} from options with a narrower value type.
 *
 * The menu reports a plain string, so the returned group forwards a request to
 * `onChange` only when it names one of the declared options. The owner
 * therefore receives its own value type without an unchecked cast.
 */
export function menuChoiceGroup<Value extends string>(group: {
  readonly label: string;
  readonly options: readonly { readonly value: Value; readonly label: string }[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
}): MenuChoiceGroup {
  return {
    label: group.label,
    options: group.options,
    value: group.value,
    onChange: (requested) => {
      const option = group.options.find((candidate) => candidate.value === requested);
      if (option !== undefined) {
        group.onChange(option.value);
      }
    },
  };
}
