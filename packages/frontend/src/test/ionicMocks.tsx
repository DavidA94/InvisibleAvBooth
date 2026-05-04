/**
 * Lightweight mocks for Ionic form components.
 *
 * Replaces IonInput, IonCheckbox, and IonTextarea with plain HTML equivalents.
 * Tests interact via userEvent.type / userEvent.click.
 *
 * Real Ionic rendering is validated by Playwright E2E tests.
 */
import React from "react";
import { vi } from "vitest";

vi.mock("@ionic/react", async () => {
  const actual = await vi.importActual("@ionic/react");
  return {
    ...actual,
    IonInput: ({ onIonInput, value, label, labelPlacement: _, fill: _f, clearInput: _c, ...props }: Record<string, unknown>) =>
      React.createElement("input", {
        "aria-label": label,
        ...props,
        value: value ?? "",
        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
          (onIonInput as ((e: { detail: { value: string } }) => void) | undefined)?.({ detail: { value: e.target.value } }),
      }),
    IonCheckbox: ({ onIonChange, checked, ...props }: Record<string, unknown>) =>
      React.createElement("input", {
        type: "checkbox",
        ...props,
        checked: checked ?? false,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
          (onIonChange as ((e: { detail: { checked: boolean } }) => void) | undefined)?.({ detail: { checked: e.target.checked } }),
      }),
    IonTextarea: ({ onIonInput, value, label, labelPlacement: _, fill: _f, ...props }: Record<string, unknown>) =>
      React.createElement("textarea", {
        "aria-label": label,
        ...props,
        value: value ?? "",
        onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
          (onIonInput as ((e: { detail: { value: string } }) => void) | undefined)?.({ detail: { value: e.target.value } }),
      }),
  };
});
