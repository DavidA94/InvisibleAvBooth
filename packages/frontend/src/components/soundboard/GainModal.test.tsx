import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { GainModal } from "./GainModal";
import { HorizontalGainSlider } from "./HorizontalGainSlider";
import {
  TEST_ID_MIXER_GAIN_MODAL,
  TEST_ID_MIXER_ENVELOPE_CANVAS,
  TEST_ID_MIXER_GAIN_UNAVAILABLE_NOTE,
  TEST_ID_MIXER_GAIN_SLIDER,
} from "../../constants/testIds";

// A controllable WebSocket mock so we can drive open/close/message.
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onmessage: ((e: { data: ArrayBuffer }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  binaryType = "arraybuffer";
  readyState = 1;
  close = vi.fn();
  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }
}

describe("HorizontalGainSlider", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("emits gain changes through useHeldControl", () => {
    const onGainChange = vi.fn();
    render(<HorizontalGainSlider gainDb={0} minDb={-12} maxDb={60} onGainChange={onGainChange} />);
    const input = screen.getByRole("slider");
    act(() => fireEvent.change(input, { target: { value: "24" } }));
    expect(onGainChange).toHaveBeenCalled();
  });
});

describe("GainModal", () => {
  const baseProps = {
    isOpen: true,
    mixerId: "mix1",
    channel: 3,
    channelName: "Speaker",
    gainDb: 12,
    minDb: -12,
    maxDb: 60,
    onClose: vi.fn(),
    onGainChange: vi.fn(),
    onMonitorStart: vi.fn(),
    onMonitorStop: vi.fn(),
  };

  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    // location is provided by jsdom; ensure host exists.
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("renders the header with the channel number and name", () => {
    render(<GainModal {...baseProps} captureAvailable={false} onMonitorStart={vi.fn()} onMonitorStop={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_MIXER_GAIN_MODAL).textContent).toContain("Gain for Channel 3 (Speaker)");
  });

  it("omits the empty parens when the channel has no name", () => {
    render(<GainModal {...baseProps} channelName="" captureAvailable={false} onMonitorStart={vi.fn()} onMonitorStop={vi.fn()} />);
    const text = screen.getByTestId(TEST_ID_MIXER_GAIN_MODAL).textContent ?? "";
    expect(text).toContain("Gain for Channel 3");
    expect(text).not.toContain("()");
  });

  it("slider-only tier (no capture): no envelope canvas, no monitor request", () => {
    const onMonitorStart = vi.fn();
    render(<GainModal {...baseProps} captureAvailable={false} onMonitorStart={onMonitorStart} onMonitorStop={vi.fn()} />);
    expect(screen.queryByTestId(TEST_ID_MIXER_ENVELOPE_CANVAS)).toBeNull();
    expect(screen.getByTestId(TEST_ID_MIXER_GAIN_SLIDER)).toBeInTheDocument();
    expect(onMonitorStart).not.toHaveBeenCalled();
  });

  it("window tier (capture available): renders the envelope + requests a monitor", () => {
    const onMonitorStart = vi.fn();
    render(<GainModal {...baseProps} captureAvailable={true} onMonitorStart={onMonitorStart} onMonitorStop={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_MIXER_ENVELOPE_CANVAS)).toBeInTheDocument();
    expect(onMonitorStart).toHaveBeenCalledTimes(1);
    expect(MockWebSocket.instances.length).toBe(1);
  });

  it("stops the monitor on unmount", () => {
    const onMonitorStop = vi.fn();
    const { unmount } = render(<GainModal {...baseProps} captureAvailable={true} onMonitorStart={vi.fn()} onMonitorStop={onMonitorStop} />);
    unmount();
    expect(onMonitorStop).toHaveBeenCalled();
  });

  it("drops to slider-only with a calm note when the stream stalls (capture crash, Req 15.6)", () => {
    render(<GainModal {...baseProps} captureAvailable={true} onMonitorStart={vi.fn()} onMonitorStop={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_MIXER_ENVELOPE_CANVAS)).toBeInTheDocument();
    // Simulate an unexpected socket close (capture crash).
    act(() => {
      MockWebSocket.instances[0]!.onclose?.();
    });
    expect(screen.queryByTestId(TEST_ID_MIXER_ENVELOPE_CANVAS)).toBeNull();
    expect(screen.getByTestId(TEST_ID_MIXER_GAIN_UNAVAILABLE_NOTE)).toBeInTheDocument();
  });
});
