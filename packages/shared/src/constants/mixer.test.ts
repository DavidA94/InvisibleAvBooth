import { describe, it, expect } from "vitest";
import { resolveMixerColor, MIXER_COLOR_HEX } from "./mixer";

describe("resolveMixerColor", () => {
  it("returns null for undefined (not yet read) and OFF (0 / 8)", () => {
    expect(resolveMixerColor(undefined)).toBeNull();
    expect(resolveMixerColor(0)).toBeNull();
    expect(resolveMixerColor(8)).toBeNull(); // OFFi
  });

  it("maps base hues (1–7) to outline style (not inverted)", () => {
    expect(resolveMixerColor(1)).toEqual({ hex: MIXER_COLOR_HEX[1], inverted: false }); // red
    expect(resolveMixerColor(4)).toEqual({ hex: MIXER_COLOR_HEX[4], inverted: false }); // blue
    expect(resolveMixerColor(7)).toEqual({ hex: MIXER_COLOR_HEX[7], inverted: false }); // white
  });

  it("maps inverted variants (9–15) to the same hue with inverted=true (solid fill)", () => {
    expect(resolveMixerColor(9)).toEqual({ hex: MIXER_COLOR_HEX[1], inverted: true }); // RDi
    expect(resolveMixerColor(15)).toEqual({ hex: MIXER_COLOR_HEX[7], inverted: true }); // WHi
  });
});
