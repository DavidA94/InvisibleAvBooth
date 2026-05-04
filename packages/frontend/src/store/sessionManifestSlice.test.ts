// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./index";
import { INITIAL_OBS_STATE } from "./obsSlice";
import type { SessionManifest } from "../types";

beforeEach(() => {
  useStore.setState({
    user: null,
    obsState: INITIAL_OBS_STATE,
    obsPending: false,
    manifest: {},
    interpolatedStreamTitle: "",
    interpolatedDescription: "",
    manifestReady: false,
    notifications: [],
  });
});

describe("sessionManifestSlice", () => {
  it("starts with empty manifest and empty title", () => {
    expect(useStore.getState().manifest).toEqual({});
    expect(useStore.getState().interpolatedStreamTitle).toBe("");
    expect(useStore.getState().interpolatedDescription).toBe("");
    expect(useStore.getState().manifestReady).toBe(false);
  });

  it("setManifest updates manifest and interpolated title", () => {
    const manifest: SessionManifest = { speaker: "John", title: "Grace" };
    useStore.getState().setManifest(manifest, "Apr 18 – John – Grace", "A sermon about grace", true);
    expect(useStore.getState().manifest).toEqual(manifest);
    expect(useStore.getState().interpolatedStreamTitle).toBe("Apr 18 – John – Grace");
    expect(useStore.getState().interpolatedDescription).toBe("A sermon about grace");
    expect(useStore.getState().manifestReady).toBe(true);
  });
});
