import { describe, it, expect } from "vitest";
import { capitalizeFirst } from "./displayName";

describe("capitalizeFirst", () => {
  it.each`
    stored              | shown
    ${"brenden"}        | ${"Brenden"}
    ${"Clyde"}          | ${"Clyde"}
    ${"admin"}          | ${"Admin"}
    ${"test-volunteer"} | ${"Test-volunteer"}
    ${"mary ann"}       | ${"Mary ann"}
    ${"mcDonald"}       | ${"McDonald"}
    ${"1stuser"}        | ${"1stuser"}
    ${"a"}              | ${"A"}
    ${""}               | ${""}
  `("shows '$stored' as '$shown'", ({ stored, shown }: { stored: string; shown: string }) => {
    expect(capitalizeFirst(stored)).toBe(shown);
  });
});
