import type { StylesConfig, GroupBase } from "react-select";

/**
 * Dark-theme styles for react-select that match the Invisible A/V Booth design tokens.
 * Used by all dropdowns in the application for visual consistency.
 *
 * Scale invariance (dashboard-management Req 2.10): react-select derives its paddings and margins from a
 * px `baseUnit` (4px), which does not shrink with the dashboard's root font size, so dropdowns grew
 * taller relative to everything else on smaller screens and pushed content (e.g. Camera presets) out of
 * view. Every padding/margin that sets the control's size is restated here in rem with the same value at
 * a 16px root, so full-scale rendering is unchanged.
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
    valueContainer: (base) => ({
      ...base,
      padding: "0.125rem 0.5rem", // was 2px 8px
    }),
    input: (base) => ({
      ...base,
      color: "var(--color-text)",
      margin: "0.125rem", // was 2px
      paddingTop: "0.125rem",
      paddingBottom: "0.125rem",
    }),
    menuList: (base) => ({
      ...base,
      maxHeight: "14rem",
      padding: 0,
    }),
    option: (base, state) => ({
      ...base,
      background: state.isDisabled ? "transparent" : state.isFocused ? "var(--color-primary)" : "transparent",
      color: state.isDisabled ? "var(--color-text-muted)" : "var(--color-text)",
      padding: "0.5rem 0.75rem",
      cursor: state.isDisabled ? "not-allowed" : "pointer",
      opacity: state.isDisabled ? 0.5 : 1,
      "&:active": { background: state.isDisabled ? "transparent" : "var(--color-primary-hover)" },
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
    indicatorSeparator: (base) => ({
      ...base,
      backgroundColor: "var(--color-border)",
      marginTop: "0.5rem", // was 8px
      marginBottom: "0.5rem",
    }),
    dropdownIndicator: (base, state) => ({
      ...base,
      padding: "0.5rem", // was 8px
      color: state.isDisabled ? "var(--color-text-muted)" : "var(--color-text-muted)",
      "&:hover": { color: "var(--color-text)" },
    }),
    clearIndicator: (base) => ({
      ...base,
      padding: "0.5rem", // was 8px
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
    multiValue: (base) => ({
      ...base,
      background: "var(--color-surface)",
      borderRadius: "0.25rem",
      border: "1px solid var(--color-border)",
    }),
    multiValueLabel: (base) => ({
      ...base,
      color: "var(--color-text)",
      fontSize: "0.8rem",
      padding: "0.125rem 0.375rem",
    }),
    multiValueRemove: (base) => ({
      ...base,
      color: "var(--color-text-muted)",
      "&:hover": { background: "var(--color-danger)", color: "var(--color-text)" },
    }),
    menuPortal: (base) => ({
      ...base,
      zIndex: 10100,
    }),
  };
}
