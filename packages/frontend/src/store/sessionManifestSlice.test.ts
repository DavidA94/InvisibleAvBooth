import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./index";
import { INITIAL_OBS_STATE } from "./obsSlice";
import type { SessionManifest } from "../types";

beforeEach(() => {
  useStore.setState({ user: null, obsState: INITIAL_OBS_STATE, obsPending: false, manifest: {}, interpolatedStreamTitle: "", notifications: [] });
});

describe("sessionManifestSlice", () => {
  it("starts with empty manifest and empty title", () => {
    expect(useStore.getState().manifest).toEqual({});
    expect(useStore.getState().interpolatedStreamTitle).toBe("");
  });

  it("setManifest updates manifest and interpolated title", () => {
    const manifest: SessionManifest = { speaker: "John", title: "Grace" };
    useStore.getState().setManifest(manifest, "Apr 18 – John – Grace");
    expect(useStore.getState().manifest).toEqual(manifest);
    expect(useStore.getState().interpolatedStreamTitle).toBe("Apr 18 – John – Grace");
  });
});
