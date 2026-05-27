import { TEST_ID_SWIPEABLE_ROW } from "../../constants/testIds";
import { useState, useRef, useCallback } from "react";
import type { ReactNode, TouchEvent, MouseEvent } from "react";

interface SwipeableRowProps {
  children: ReactNode;
  leftActions?: ReactNode;
  rightActions?: ReactNode;
  actionWidth?: number;
  onOpen?: () => void;
  forceClose?: boolean;
}

const SWIPE_THRESHOLD = 30;
const BASE_REM = 16;

export function SwipeableRow({ children, leftActions, rightActions, actionWidth = 5.5, onOpen, forceClose }: SwipeableRowProps): ReactNode {
  const [offset, setOffset] = useState(0);
  const [revealed, setRevealed] = useState<"none" | "left" | "right">("none");
  const startX = useRef(0);
  const startY = useRef(0);
  const isTracking = useRef(false);
  const maxOffset = actionWidth * BASE_REM;

  if (forceClose && revealed !== "none") {
    setRevealed("none");
    setOffset(0);
  }

  const handleStart = useCallback((clientX: number, clientY: number) => {
    startX.current = clientX;
    startY.current = clientY;
    isTracking.current = true;
  }, []);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!isTracking.current) return;
    const deltaX = clientX - startX.current;
    const deltaY = clientY - startY.current;
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
      isTracking.current = false;
      return;
    }
    let clamped = deltaX;
    if (!rightActions && deltaX > 0) clamped = 0;
    if (!leftActions && deltaX < 0) clamped = 0;
    clamped = Math.max(-maxOffset, Math.min(maxOffset, clamped));
    setOffset(clamped);
  }, [leftActions, rightActions, maxOffset]);

  const handleEnd = useCallback(() => {
    isTracking.current = false;
    if (Math.abs(offset) > SWIPE_THRESHOLD) {
      if (offset > 0 && rightActions) {
        setRevealed("right"); setOffset(maxOffset); onOpen?.();
      } else if (offset < 0 && leftActions) {
        setRevealed("left"); setOffset(-maxOffset); onOpen?.();
      } else {
        setRevealed("none"); setOffset(0);
      }
    } else {
      setRevealed("none"); setOffset(0);
    }
  }, [offset, leftActions, rightActions, maxOffset, onOpen]);

  // Touch handlers
  const onTouchStart = useCallback((event: TouchEvent) => {
    const touch = event.touches[0];
    if (touch) handleStart(touch.clientX, touch.clientY);
  }, [handleStart]);

  const onTouchMove = useCallback((event: TouchEvent) => {
    const touch = event.touches[0];
    if (touch) handleMove(touch.clientX, touch.clientY);
  }, [handleMove]);

  // Mouse handlers
  const onMouseDown = useCallback((event: MouseEvent) => {
    handleStart(event.clientX, event.clientY);
    const onMouseMove = (moveEvent: globalThis.MouseEvent): void => handleMove(moveEvent.clientX, moveEvent.clientY);
    const onMouseUp = (): void => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      // Only call handleEnd if we were actually dragging (not just a click)
      if (Math.abs(event.clientX - startX.current) > 5 || Math.abs(offset) > 5) {
        handleEnd();
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [handleStart, handleMove, handleEnd, offset]);

  const handleContentTap = useCallback(() => {
    if (revealed !== "none") { setRevealed("none"); setOffset(0); }
  }, [revealed]);

  return (
    <div className="swipeable-row" data-testid={TEST_ID_SWIPEABLE_ROW}>
      {rightActions && <div className="swipeable-actions swipeable-actions--right" style={{ width: `${actionWidth}rem` }}>{rightActions}</div>}
      {leftActions && <div className="swipeable-actions swipeable-actions--left" style={{ width: `${actionWidth}rem` }}>{leftActions}</div>}
      <div
        className="swipeable-content"
        style={{ transform: `translateX(${offset}px)`, transition: isTracking.current ? "none" : "transform 200ms ease-out" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={handleEnd}
        onMouseDown={onMouseDown}
        onClick={handleContentTap}
      >
        {children}
      </div>
    </div>
  );
}
