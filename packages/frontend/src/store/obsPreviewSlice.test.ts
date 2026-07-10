import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./index";

describe("obsPreviewSlice", () => {
  beforeEach(() => {
    useStore.setState({ obsPreviewStatus: "inactive", obsPreviewNdiConfigured: false });
  });

  it("setObsPreviewStatus updates status", () => {
    useStore.getState().setObsPreviewStatus("streaming");
    expect(useStore.getState().obsPreviewStatus).toBe("streaming");
  });

  it("setObsPreviewNdiConfigured updates configured flag", () => {
    useStore.getState().setObsPreviewNdiConfigured(true);
    expect(useStore.getState().obsPreviewNdiConfigured).toBe(true);
  });
});
