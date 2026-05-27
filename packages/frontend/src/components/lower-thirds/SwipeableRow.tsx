import { TEST_ID_SWIPEABLE_ROW } from "../../constants/testIds";
import { useState, useRef, useCallback, useEffect } from "react";
import type { ReactNode, PointerEvent } from "react";

interface SwipeableRowProps {
  children: ReactNode;
  leftActions?: ReactNode;
  rightActions?: ReactNode;
  leftCount?: number;
  rightCount?: number;
  onOpen?: () => void;
  forceClose?: boolean;
}

const SWIPE_THRESHOLD = 20;
const BUTTON_WIDTH_PX = 48;

export function SwipeableRow({ children, leftActions, rightActions, leftCount = 1, rightCount = 1, onOpen, forceClose }: SwipeableRowProps): ReactNode {
  const [offset, setOffset] = useState(0);
  const [revealed, setRevealed] = useState<"none" | "left" | "right">("none");
  const tracking = useRef(false);
  const startX = useRef(0);
  const currentOffset = useRef(0);

  const leftWidth = leftActions ? leftCount * BUTTON_WIDTH_PX : 0;
  const rightWidth = rightActions ? rightCount * BUTTON_WIDTH_PX : 0;

  useEffect(() => {
    if (forceClose && revealed !== "none") {
      setRevealed("none");
      setOffset(0);
      currentOffset.current = 0;
    }
  }, [forceClose, revealed]);

  const handlePointerDown = useCallback((event: PointerEvent) => {
    const target = event.target as HTMLElement;
    if (target.setPointerCapture) {
      target.setPointerCapture(event.pointerId);
    }
    startX.current = event.clientX;
    tracking.current = true;
  }, []);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    if (!tracking.current) return;
    const delta = event.clientX - startX.current;
    let clamped = delta;
    if (!rightActions && delta > 0) clamped = 0;
    if (!leftActions && delta < 0) clamped = 0;
    if (delta < 0) clamped = Math.max(-leftWidth, delta);
    if (delta > 0) clamped = Math.min(rightWidth, delta);
    currentOffset.current = clamped;
    setOffset(clamped);
  }, [leftActions, rightActions, leftWidth, rightWidth]);

  const handlePointerUp = useCallback(() => {
    if (!tracking.current) return;
    tracking.current = false;
    const current = currentOffset.current;
    if (current < -SWIPE_THRESHOLD && leftActions) {
      setRevealed("left");
      setOffset(-leftWidth);
      currentOffset.current = -leftWidth;
      onOpen?.();
    } else if (current > SWIPE_THRESHOLD && rightActions) {
      setRevealed("right");
      setOffset(rightWidth);
      currentOffset.current = rightWidth;
      onOpen?.();
    } else {
      setRevealed("none");
      setOffset(0);
      currentOffset.current = 0;
    }
  }, [leftActions, rightActions, leftWidth, rightWidth, onOpen]);

  const handleContentClick = useCallback(() => {
    if (revealed !== "none") {
      setRevealed("none");
      setOffset(0);
      currentOffset.current = 0;
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
        style={{ transform: `translateX(${offset}px)`, transition: tracking.current ? "none" : "transform 200ms ease-out" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleContentClick}
      >
        {children}
      </div>
    </div>
  );
}
