import { TEST_ID_SWIPEABLE_ROW } from "../../constants/testIds";
import { useState, useRef, useCallback, useEffect, Children } from "react";
import type { ReactNode, TouchEvent, MouseEvent } from "react";

interface SwipeableRowProps {
  children: ReactNode;
  leftActions?: ReactNode;
  rightActions?: ReactNode;
  onOpen?: () => void;
  forceClose?: boolean;
}

const SWIPE_THRESHOLD = 20;
const BUTTON_WIDTH_REM = 3; // each action button is 3rem wide
const BASE_REM = 16;

function countChildren(node: ReactNode): number {
  if (!node) return 0;
  // If it's a single element (not wrapped in a fragment/div), count as 1
  const count = Children.count(node);
  return Math.max(1, count);
}

export function SwipeableRow({ children, leftActions, rightActions, onOpen, forceClose }: SwipeableRowProps): ReactNode {
  const [offset, setOffset] = useState(0);
  const [revealed, setRevealed] = useState<"none" | "left" | "right">("none");
  const startX = useRef(0);
  const isTracking = useRef(false);
  const hasMoved = useRef(false);

  const leftWidth = countChildren(leftActions) * BUTTON_WIDTH_REM * BASE_REM;
  const rightWidth = countChildren(rightActions) * BUTTON_WIDTH_REM * BASE_REM;

  useEffect(() => {
    if (forceClose && revealed !== "none") {
      setRevealed("none");
      setOffset(0);
    }
  }, [forceClose, revealed]);

  const handleStart = useCallback((clientX: number) => {
    startX.current = clientX;
    isTracking.current = true;
    hasMoved.current = false;
  }, []);

  const handleMove = useCallback((clientX: number) => {
    if (!isTracking.current) return;
    const delta = clientX - startX.current;
    if (Math.abs(delta) > 5) hasMoved.current = true;
    let clamped = delta;
    if (!rightActions && delta > 0) clamped = 0;
    if (!leftActions && delta < 0) clamped = 0;
    if (delta < 0) clamped = Math.max(-leftWidth, delta);
    if (delta > 0) clamped = Math.min(rightWidth, delta);
    setOffset(clamped);
  }, [leftActions, rightActions, leftWidth, rightWidth]);

  const handleEnd = useCallback(() => {
    isTracking.current = false;
    // Snap: if past threshold, fully open; otherwise fully close
    if (offset < -SWIPE_THRESHOLD && leftActions) {
      setRevealed("left");
      setOffset(-leftWidth);
      onOpen?.();
    } else if (offset > SWIPE_THRESHOLD && rightActions) {
      setRevealed("right");
      setOffset(rightWidth);
      onOpen?.();
    } else {
      setRevealed("none");
      setOffset(0);
    }
  }, [offset, leftActions, rightActions, leftWidth, rightWidth, onOpen]);

  const onTouchStart = useCallback((event: TouchEvent) => {
    const touch = event.touches[0];
    if (touch) handleStart(touch.clientX);
  }, [handleStart]);

  const onTouchMove = useCallback((event: TouchEvent) => {
    const touch = event.touches[0];
    if (touch) handleMove(touch.clientX);
  }, [handleMove]);

  const onMouseDown = useCallback((event: MouseEvent) => {
    event.preventDefault();
    handleStart(event.clientX);
    const onMouseMove = (moveEvent: globalThis.MouseEvent): void => handleMove(moveEvent.clientX);
    const onMouseUp = (): void => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      handleEnd();
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [handleStart, handleMove, handleEnd]);

  const handleContentClick = useCallback(() => {
    if (revealed !== "none" && !hasMoved.current) {
      setRevealed("none");
      setOffset(0);
    }
  }, [revealed]);

  return (
    <div className="swipeable-row" data-testid={TEST_ID_SWIPEABLE_ROW}>
      {rightActions && (
        <div className="swipeable-actions swipeable-actions--right" style={{ width: `${rightWidth}px` }}>
          {rightActions}
        </div>
      )}
      {leftActions && (
        <div className="swipeable-actions swipeable-actions--left" style={{ width: `${leftWidth}px` }}>
          {leftActions}
        </div>
      )}
      <div
        className="swipeable-content"
        style={{ transform: `translateX(${offset}px)`, transition: isTracking.current ? "none" : "transform 200ms ease-out" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={handleEnd}
        onMouseDown={onMouseDown}
        onClick={handleContentClick}
      >
        {children}
      </div>
    </div>
  );
}
