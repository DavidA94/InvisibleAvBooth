import { useRef, useCallback, useState } from "react";
import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";

const DEAD_ZONE = 0.15;
const QUANTIZATION = 0.05;

export interface PtzJoystickProps {
  onMove: (pan: number, tilt: number) => void;
  onStart: (pan: number, tilt: number) => void;
  onStop: () => void;
  disabled?: { pan?: boolean; tilt?: boolean } | undefined;
}

function quantize(val: number): number {
  return Math.round(val / QUANTIZATION) * QUANTIZATION;
}

export function PtzJoystick({ onMove, onStart, onStop, disabled }: PtzJoystickProps): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dotPos, setDotPos] = useState({ x: 0, y: 0 });
  const activeRef = useRef(false);
  const lastEmitted = useRef({ pan: 0, tilt: 0 });

  const computeSpeed = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      if (!el) return { pan: 0, tilt: 0 };
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const radius = rect.width / 2;

      let dx = (clientX - cx) / radius;
      let dy = (clientY - cy) / radius;

      // Clamp to unit circle
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        dx /= dist;
        dy /= dist;
      }

      setDotPos({ x: dx, y: dy });

      // Dead zone
      if (dist < DEAD_ZONE) return { pan: 0, tilt: 0 };

      // Scale from dead zone edge to 1
      const scaled = (dist - DEAD_ZONE) / (1 - DEAD_ZONE);
      const angle = Math.atan2(dy, dx);
      let pan = quantize(Math.cos(angle) * scaled);
      let tilt = quantize(-Math.sin(angle) * scaled); // invert Y

      if (disabled?.pan) pan = 0;
      if (disabled?.tilt) tilt = 0;

      return { pan, tilt };
    },
    [disabled],
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // jsdom doesn't support setPointerCapture
      }
      const speed = computeSpeed(e.clientX, e.clientY);
      if (speed.pan !== 0 || speed.tilt !== 0) {
        activeRef.current = true;
        lastEmitted.current = speed;
        onStart(speed.pan, speed.tilt);
      }
    },
    [computeSpeed, onStart],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!activeRef.current && !e.buttons) return;
      const speed = computeSpeed(e.clientX, e.clientY);

      if (!activeRef.current && (speed.pan !== 0 || speed.tilt !== 0)) {
        activeRef.current = true;
        lastEmitted.current = speed;
        onStart(speed.pan, speed.tilt);
        return;
      }

      if (activeRef.current && (speed.pan !== lastEmitted.current.pan || speed.tilt !== lastEmitted.current.tilt)) {
        lastEmitted.current = speed;
        onMove(speed.pan, speed.tilt);
      }
    },
    [computeSpeed, onMove, onStart],
  );

  const handlePointerUp = useCallback(() => {
    if (activeRef.current) {
      activeRef.current = false;
      onStop();
    }
    setDotPos({ x: 0, y: 0 });
    lastEmitted.current = { pan: 0, tilt: 0 };
  }, [onStop]);

  return (
    <div
      ref={containerRef}
      className="ptz-joystick"
      data-testid="ptz-joystick"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ touchAction: "none" }}
    >
      <div className="ptz-joystick-deadzone" />
      <div
        className="ptz-joystick-dot"
        data-testid="ptz-joystick-dot"
        style={{ left: `${50 + dotPos.x * 40}%`, top: `${50 + dotPos.y * 40}%` }}
      />
    </div>
  );
}
