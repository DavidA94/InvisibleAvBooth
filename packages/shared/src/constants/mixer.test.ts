import { describe, it, expect } from "vitest";
import { resolveMixerColor, MIXER_COLOR_HEX } from "./mixer";

describe("resolveMixerColor", () => {
  it("returns null for undefined (not yet read) and OFF (0 / 8)", () => {
    expect(resolveMixerColor(undefined)).toBeNull();
    expect(resolveMixerColor(0)).toBeNull();
    expect(resolveMixerColor(8)).toBeNull(); // OFFi
  });

  it("maps base hues (1–7) to a SOLID fill (matches the X AIR app)", () => {
    expect(resolveMixerColor(1)).toEqual({ hex: MIXER_COLOR_HEX[1], filled: true }); // red
    expect(resolveMixerColor(4)).toEqual({ hex: MIXER_COLOR_HEX[4], filled: true }); // blue
    expect(resolveMixerColor(7)).toEqual({ hex: MIXER_COLOR_HEX[7], filled: true }); // white
  });

  it("maps inverted variants (9–15) to the same hue as an OUTLINE", () => {
    expect(resolveMixerColor(9)).toEqual({ hex: MIXER_COLOR_HEX[1], filled: false }); // RDi
    expect(resolveMixerColor(15)).toEqual({ hex: MIXER_COLOR_HEX[7], filled: false }); // WHi
  });
});
