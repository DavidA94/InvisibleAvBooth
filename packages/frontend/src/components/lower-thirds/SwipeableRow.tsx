import { useState, useRef, useCallback } from "react";
import type { ReactNode, TouchEvent } from "react";

interface SwipeableRowProps {
  children: ReactNode;
  leftActions?: ReactNode;
  rightActions?: ReactNode;
  /** Width of the revealed action area in rem */
  actionWidth?: number;
  /** Called when this row opens — parent uses this to close other rows */
  onOpen?: () => void;
  /** Controlled: force closed from parent */
  forceClose?: boolean;
}

const SWIPE_THRESHOLD = 30; // px minimum to trigger reveal
const BASE_REM = 16;

export function SwipeableRow({ children, leftActions, rightActions, actionWidth = 4, onOpen, forceClose }: SwipeableRowProps): ReactNode {
  const [offset, setOffset] = useState(0);
  const [revealed, setRevealed] = useState<"none" | "left" | "right">("none");
  const startX = useRef(0);
  const startY = useRef(0);
  const isTracking = useRef(false);
  const maxOffset = actionWidth * BASE_REM;

  // Force close from parent
  if (forceClose && revealed !== "none") {
    setRevealed("none");
    setOffset(0);
  }

  const handleTouchStart = useCallback((event: TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    isTracking.current = true;
  }, []);

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      if (!isTracking.current) return;
      const touch = event.touches[0];
      if (!touch) return;

      const deltaX = touch.clientX - startX.current;
      const deltaY = touch.clientY - startY.current;

      // If vertical movement dominates, stop tracking (allow scroll)
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
        isTracking.current = false;
        return;
      }

      // Clamp offset based on available actions
      let clamped = deltaX;
      if (!rightActions && deltaX > 0) clamped = 0;
      if (!leftActions && deltaX < 0) clamped = 0;
      clamped = Math.max(-maxOffset, Math.min(maxOffset, clamped));

      setOffset(clamped);
    },
    [leftActions, rightActions, maxOffset],
  );

  const handleTouchEnd = useCallback(() => {
    isTracking.current = false;
    if (Math.abs(offset) > SWIPE_THRESHOLD) {
      if (offset > 0 && rightActions) {
        setRevealed("right");
        setOffset(maxOffset);
        onOpen?.();
      } else if (offset < 0 && leftActions) {
        setRevealed("left");
        setOffset(-maxOffset);
        onOpen?.();
      } else {
        setRevealed("none");
        setOffset(0);
      }
    } else {
      setRevealed("none");
      setOffset(0);
    }
  }, [offset, leftActions, rightActions, maxOffset, onOpen]);

  const handleContentTap = useCallback(() => {
    if (revealed !== "none") {
      setRevealed("none");
      setOffset(0);
    }
  }, [revealed]);

  return (
    <div className="swipeable-row" data-testid="swipeable-row">
      {/* Left actions (revealed by swiping right) */}
      {rightActions && (
        <div className="swipeable-actions swipeable-actions--right" style={{ width: `${actionWidth}rem` }}>
          {rightActions}
        </div>
      )}

      {/* Right actions (revealed by swiping left) */}
      {leftActions && (
        <div className="swipeable-actions swipeable-actions--left" style={{ width: `${actionWidth}rem` }}>
          {leftActions}
        </div>
      )}

      {/* Main content */}
      <div
        className="swipeable-content"
        style={{ transform: `translateX(${offset}px)`, transition: isTracking.current ? "none" : "transform 200ms ease-out" }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleContentTap}
      >
        {children}
      </div>
    </div>
  );
}
