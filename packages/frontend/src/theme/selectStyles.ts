import type { StylesConfig, GroupBase } from "react-select";

/**
 * Dark-theme styles for react-select that match the Invisible A/V Booth design tokens.
 * Used by all dropdowns in the application for visual consistency.
 */
export function darkSelectStyles<Option, IsMulti extends boolean = false, Group extends GroupBase<Option> = GroupBase<Option>>(): StylesConfig<
  Option,
  IsMulti,
  Group
> {
  return {
    control: (base, state) => ({
      ...base,
      background: "var(--color-surface-raised)",
      borderColor: state.isFocused ? "var(--color-primary)" : "var(--color-border)",
      borderRadius: "0.375rem",
      minHeight: "2.5rem",
      boxShadow: "none",
      opacity: 1,
      "&:hover": { borderColor: state.isDisabled ? "var(--color-border)" : "var(--color-primary)" },
    }),
    menu: (base) => ({
      ...base,
      background: "var(--color-surface-raised)",
      borderRadius: "0.375rem",
      border: "1px solid var(--color-border)",
      zIndex: 200,
    }),
    menuList: (base) => ({
      ...base,
      maxHeight: "14rem",
      padding: 0,
    }),
    option: (base, state) => ({
      ...base,
      background: state.isFocused ? "var(--color-primary)" : "transparent",
      color: state.isFocused ? "var(--color-text)" : "var(--color-text)",
      padding: "0.5rem 0.75rem",
      cursor: "pointer",
      "&:active": { background: "var(--color-primary-hover)" },
    }),
    singleValue: (base, state) => ({
      ...base,
      color: state.isDisabled ? "var(--color-text-muted)" : "var(--color-text)",
      opacity: 1,
    }),
    placeholder: (base) => ({
      ...base,
      color: "var(--color-text-muted)",
    }),
    input: (base) => ({
      ...base,
      color: "var(--color-text)",
    }),
    indicatorSeparator: (base) => ({
      ...base,
      backgroundColor: "var(--color-border)",
    }),
    dropdownIndicator: (base, state) => ({
      ...base,
      color: state.isDisabled ? "var(--color-text-muted)" : "var(--color-text-muted)",
      "&:hover": { color: "var(--color-text)" },
    }),
    clearIndicator: (base) => ({
      ...base,
      color: "var(--color-text-muted)",
      "&:hover": { color: "var(--color-danger)" },
    }),
    groupHeading: (base) => ({
      ...base,
      color: "var(--color-text-muted)",
      fontWeight: "bold",
      fontSize: "0.75rem",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      padding: "0.5rem 0.75rem 0.25rem",
    }),
    noOptionsMessage: (base) => ({
      ...base,
      color: "var(--color-text-muted)",
    }),
    menuPortal: (base) => ({
      ...base,
      zIndex: 10100,
    }),
  };
}
