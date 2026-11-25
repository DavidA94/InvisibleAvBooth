import type { ReactNode } from "react";
import { components } from "react-select";
import type { GroupBase, InputProps } from "react-select";

/**
 * Numbers-only type-to-search for the chapter / verse / end-verse dropdowns
 * (livestream-control-system spec Req 19.10).
 *
 * Why: scrolling a 150-chapter or 176-verse list on a tablet mid-service is slow and easy to
 * overshoot. Typing "23" is two taps. These helpers keep that behavior in one place so all three
 * dropdowns stay identical.
 */

/** Longest chapter or verse number in the KJV is 176 (Psalm 119), so three digits is enough. */
export const MAX_NUMERIC_INPUT_LENGTH = 3;

/**
 * `onInputChange` handler: strip anything that is not a digit and cap the length.
 *
 * react-select 5 uses the returned string as the new input value, so rejected characters are never
 * shown. Silently discarding them (instead of showing an error) is deliberate: on a number pad the
 * only way to get a letter is a stray tap, and an error message would be more distracting than useful.
 */
export function sanitizeNumericInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, MAX_NUMERIC_INPUT_LENGTH);
}

/**
 * `filterOption`: an option matches when its label STARTS WITH the typed digits.
 *
 * react-select's default is "contains", which was rejected: typing "1" would also list 21, 31, 41…,
 * and typing "3" would not put 3 first, so Enter could pick a wrong number. With prefix matching on
 * ascending options, the exact number typed is always the first (focused) option.
 */
export function matchesNumberPrefix(option: { label: string }, inputValue: string): boolean {
  return inputValue === "" || option.label.startsWith(inputValue);
}

/**
 * Input component that asks touch devices for the numeric keypad. react-select forwards extra props
 * to the underlying `<input>`. `pattern` is what iOS uses to pick the digit pad; `inputMode` covers
 * Android and modern iPadOS.
 */
export function NumericInput<Option, IsMulti extends boolean, Group extends GroupBase<Option>>(props: InputProps<Option, IsMulti, Group>): ReactNode {
  return <components.Input {...props} inputMode="numeric" pattern="[0-9]*" />;
}
