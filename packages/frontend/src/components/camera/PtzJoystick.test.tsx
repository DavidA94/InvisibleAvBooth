import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { PtzJoystick } from "./PtzJoystick";

function mockRect(el: HTMLElement, rect: Partial<DOMRect>) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    top: 0,
    left: 0,
    right: 200,
    bottom: 200,
    toJSON: () => ({}),
    ...rect,
  });
}

describe("PtzJoystick", () => {
  const onMove = vi.fn();
  const onStart = vi.fn();
  const onStop = vi.fn();

  function renderJoystick(disabled?: { pan?: boolean; tilt?: boolean }) {
    const result = render(<PtzJoystick onMove={onMove} onStart={onStart} onStop={onStop} disabled={disabled} />);
    const joystick = screen.getByTestId("ptz-joystick");
    mockRect(joystick, { left: 0, top: 0, width: 200, height: 200 });
    return { joystick, ...result };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders joystick and dot", () => {
    renderJoystick();
    expect(screen.getByTestId("ptz-joystick")).toBeInTheDocument();
    expect(screen.getByTestId("ptz-joystick-dot")).toBeInTheDocument();
  });

  it("calls onStart on pointerDown outside dead zone", () => {
    const { joystick } = renderJoystick();
    fireEvent.pointerDown(joystick, { clientX: 180, clientY: 100, pointerId: 1 });
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart.mock.calls[0]![0]).toBeGreaterThan(0); // pan > 0
  });

  it("does not call onStart in dead zone", () => {
    const { joystick } = renderJoystick();
    // Center is at 100,100. Click very close to center (inside dead zone)
    fireEvent.pointerDown(joystick, { clientX: 102, clientY: 100, pointerId: 1 });
    expect(onStart).not.toHaveBeenCalled();
  });

  it("calls onMove on pointerMove after start", () => {
    const { joystick } = renderJoystick();
    fireEvent.pointerDown(joystick, { clientX: 180, clientY: 100, pointerId: 1 });
    onMove.mockClear();
    fireEvent.pointerMove(joystick, { clientX: 170, clientY: 100, pointerId: 1 });
    expect(onMove).toHaveBeenCalled();
  });

  it("calls onStop on pointerUp", () => {
    const { joystick } = renderJoystick();
    fireEvent.pointerDown(joystick, { clientX: 180, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(joystick, { pointerId: 1 });
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("calls onStop on pointerCancel", () => {
    const { joystick } = renderJoystick();
    fireEvent.pointerDown(joystick, { clientX: 180, clientY: 100, pointerId: 1 });
    fireEvent.pointerCancel(joystick, { pointerId: 1 });
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("does not call onStop if not active", () => {
    const { joystick } = renderJoystick();
    fireEvent.pointerUp(joystick, { pointerId: 1 });
    expect(onStop).not.toHaveBeenCalled();
  });

  it("zeroes pan when pan is disabled", () => {
    const { joystick } = renderJoystick({ pan: true });
    fireEvent.pointerDown(joystick, { clientX: 180, clientY: 50, pointerId: 1 });
    expect(onStart).toHaveBeenCalled();
    expect(onStart.mock.calls[0]![0]).toBe(0); // pan = 0
    expect(onStart.mock.calls[0]![1]).not.toBe(0); // tilt != 0
  });

  it("zeroes tilt when tilt is disabled", () => {
    const { joystick } = renderJoystick({ tilt: true });
    fireEvent.pointerDown(joystick, { clientX: 180, clientY: 50, pointerId: 1 });
    expect(onStart).toHaveBeenCalled();
    expect(onStart.mock.calls[0]![0]).not.toBe(0); // pan != 0
    expect(onStart.mock.calls[0]![1]).toBe(0); // tilt = 0
  });

  it("clamps to unit circle when pointer is far from center", () => {
    const { joystick } = renderJoystick();
    // Far from center but still within the mocked bounds conceptually
    // With center at 100,100 and radius 100, clientX=200 gives dx=1.0 (edge of circle)
    fireEvent.pointerDown(joystick, { clientX: 200, clientY: 100, pointerId: 1 });
    expect(onStart).toHaveBeenCalled();
    const pan = onStart.mock.calls[0]![0] as number;
    expect(pan).toBeLessThanOrEqual(1);
    expect(pan).toBeGreaterThan(0);
  });

  it("resets dot position on pointerUp", () => {
    const { joystick } = renderJoystick();
    fireEvent.pointerDown(joystick, { clientX: 180, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(joystick, { pointerId: 1 });
    const dot = screen.getByTestId("ptz-joystick-dot");
    expect(dot.style.transform).toBe("translate(0%, 0%)");
  });

  it("starts on pointerMove when entering active zone without pointerDown", () => {
    const { joystick } = renderJoystick();
    // Simulate move with button pressed (e.buttons > 0 isn't checked directly, but activeRef is false)
    // pointerMove without prior pointerDown — should start if buttons pressed
    fireEvent.pointerMove(joystick, { clientX: 180, clientY: 100, buttons: 1, pointerId: 1 });
    expect(onStart).toHaveBeenCalled();
  });

  it("does not emit onMove if speed unchanged", () => {
    const { joystick } = renderJoystick();
    fireEvent.pointerDown(joystick, { clientX: 180, clientY: 100, pointerId: 1 });
    onMove.mockClear();
    // Move to same quantized position
    fireEvent.pointerMove(joystick, { clientX: 180, clientY: 100, pointerId: 1 });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("does not fire onMove or onStart when pointerMove with no buttons and not active", () => {
    const { joystick } = renderJoystick();
    fireEvent.pointerMove(joystick, { clientX: 180, clientY: 100, buttons: 0, pointerId: 1 });
    expect(onStart).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });
});
