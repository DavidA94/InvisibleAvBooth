import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "../../test/ionicMocks";
import { PresetConfigModal } from "./PresetConfigModal";
import {
  TEST_ID_PRESET_NAME_INPUT,
  TEST_ID_PRESET_SAVE_BUTTON,
  TEST_ID_PRESET_CANCEL_BUTTON,
  TEST_ID_PRESET_POSITION_SUMMARY,
  TEST_ID_PRESET_LOAD_BUTTON,
} from "../../constants/testIds";

// The embedded live widget is covered by its own tests; stub it here so this
// suite stays focused on the capture → summary → save flow (mirrors how the
// camera preset test does not re-exercise the full CameraWidget).
vi.mock("./SoundBoardWidget", () => ({
  SoundBoardWidget: () => <div data-testid="soundboard-widget-stub" />,
}));

function makeFetch(handlers: Record<string, { ok: boolean; body: unknown }>): typeof fetch {
  return vi.fn(async (url: string) => {
    for (const [pattern, response] of Object.entries(handlers)) {
      if (url.includes(pattern)) return { ok: response.ok, json: async () => response.body } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;
}

describe("PresetConfigModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("does not render when closed", () => {
    render(<PresetConfigModal open={false} mixerId="m1" onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByTestId(TEST_ID_PRESET_NAME_INPUT)).toBeNull();
  });

  it("captures the board and shows a summary of captured channels", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "capture-preset": { ok: true, body: { ok: true, payload: { "/ch/01/mix/fader": 0.5, "/ch/01/mix/on": 1, "/ch/02/mix/fader": 0.7 } } },
      }),
    );
    render(<PresetConfigModal open={true} mixerId="m1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByText("Capture current board"));
    await waitFor(() => expect(screen.getByTestId(TEST_ID_PRESET_POSITION_SUMMARY)).toBeInTheDocument());
    // Two distinct channels captured.
    expect(screen.getByTestId(TEST_ID_PRESET_POSITION_SUMMARY).textContent).toContain("2 channels captured");
  });

  it("shows a descriptive error when capture fails (unconfirmed channels)", async () => {
    vi.stubGlobal("fetch", makeFetch({ "capture-preset": { ok: false, body: { ok: false, error: "mixer did not confirm channel(s): 3" } } }));
    render(<PresetConfigModal open={true} mixerId="m1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByText("Capture current board"));
    await waitFor(() => expect(screen.getByText(/did not confirm channel/)).toBeInTheDocument());
  });

  it("saves the captured snapshot as a named preset and calls onSaved", async () => {
    const onSaved = vi.fn();
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "capture-preset": { ok: true, body: { ok: true, payload: { "/ch/01/mix/fader": 0.5 } } },
        "/presets": { ok: true, body: { id: "p1" } },
      }),
    );
    render(<PresetConfigModal open={true} mixerId="m1" onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.input(screen.getByTestId(TEST_ID_PRESET_NAME_INPUT), { target: { value: "Singers" } });
    fireEvent.click(screen.getByText("Capture current board"));
    await waitFor(() => expect(screen.getByTestId(TEST_ID_PRESET_POSITION_SUMMARY)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(TEST_ID_PRESET_SAVE_BUTTON));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("keeps Save disabled until both a name and a captured snapshot exist", () => {
    render(<PresetConfigModal open={true} mixerId="m1" onClose={vi.fn()} onSaved={vi.fn()} />);
    const save = screen.getByTestId(TEST_ID_PRESET_SAVE_BUTTON);
    expect(save).toBeDisabled();
  });

  it("resets and closes on Cancel", () => {
    const onClose = vi.fn();
    render(<PresetConfigModal open={true} mixerId="m1" onClose={onClose} onSaved={vi.fn()} />);
    fireEvent.input(screen.getByTestId(TEST_ID_PRESET_NAME_INPUT), { target: { value: "Temp" } });
    fireEvent.click(screen.getByTestId(TEST_ID_PRESET_CANCEL_BUTTON));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a network error when capture fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }) as unknown as typeof fetch,
    );
    render(<PresetConfigModal open={true} mixerId="m1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByText("Capture current board"));
    await waitFor(() => expect(screen.getByText(/Network error while capturing/)).toBeInTheDocument());
  });

  it("edits an existing preset: pre-fills the name and PUTs a rename without re-capture", async () => {
    const onSaved = vi.fn();
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchSpy = vi.fn(async (url: string, opts?: { method?: string; body?: string }) => {
      calls.push({ url, method: opts?.method ?? "GET", body: opts?.body ? JSON.parse(opts.body) : undefined });
      return { ok: true, json: async () => ({ id: "p1" }) } as Response;
    });
    vi.stubGlobal("fetch", fetchSpy as unknown as typeof fetch);

    render(<PresetConfigModal open={true} mixerId="m1" editingPreset={{ id: "p1", name: "Singers" }} onClose={vi.fn()} onSaved={onSaved} />);
    // Name is pre-filled from the existing preset; Save is enabled without a re-capture.
    expect((screen.getByTestId(TEST_ID_PRESET_NAME_INPUT) as HTMLInputElement).value).toBe("Singers");
    fireEvent.input(screen.getByTestId(TEST_ID_PRESET_NAME_INPUT), { target: { value: "Choir" } });
    fireEvent.click(screen.getByTestId(TEST_ID_PRESET_SAVE_BUTTON));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.url).toContain("/presets/p1");
    expect((put?.body as { name: string }).name).toBe("Choir");
    // Rename-only: no payload re-captured, so none is sent (preserves the snapshot).
    expect((put?.body as { payload?: unknown }).payload).toBeUndefined();
  });

  it("does not offer the Load button when creating a new preset", () => {
    render(<PresetConfigModal open={true} mixerId="m1" onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByTestId(TEST_ID_PRESET_LOAD_BUTTON)).toBeNull();
  });

  it("Load applies the editing preset to the mixer (POST .../apply)", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchSpy = vi.fn(async (url: string, opts?: { method?: string }) => {
      calls.push({ url, method: opts?.method ?? "GET" });
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    });
    vi.stubGlobal("fetch", fetchSpy as unknown as typeof fetch);

    render(<PresetConfigModal open={true} mixerId="m1" editingPreset={{ id: "p1", name: "Singers" }} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByTestId(TEST_ID_PRESET_LOAD_BUTTON));

    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.includes("/presets/p1/apply"))).toBe(true));
  });

  it("shows an error when Load fails", async () => {
    vi.stubGlobal("fetch", makeFetch({ "/apply": { ok: false, body: { error: "Mixer not found" } } }));
    render(<PresetConfigModal open={true} mixerId="m1" editingPreset={{ id: "p1", name: "Singers" }} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByTestId(TEST_ID_PRESET_LOAD_BUTTON));
    await waitFor(() => expect(screen.getByText(/Mixer not found/)).toBeInTheDocument());
  });
});
