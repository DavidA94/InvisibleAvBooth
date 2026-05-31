import { TEST_ID_SWIPEABLE_ROW } from "../../constants/testIds";
import { useState, useRef, useCallback, useEffect } from "react";
import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";

interface SwipeableRowProps {
  children: ReactNode;
  leftActions?: ReactNode;
  rightActions?: ReactNode;
  leftCount?: number;
  rightCount?: number;
  onOpen?: (() => void) | undefined;
  forceClose?: boolean | undefined;
}

const ACTION_WIDTH_PX = 48;
const VELOCITY_THRESHOLD = 0.3; // px/ms — a fast flick opens regardless of distance
const MIN_DISTANCE_PX = 10; // minimum movement to consider it a swipe at all

export function SwipeableRow({ children, leftActions, rightActions, leftCount = 1, rightCount = 1, onOpen, forceClose }: SwipeableRowProps): ReactNode {
  const [offset, setOffset] = useState(0);
  const [revealed, setRevealed] = useState<"none" | "left" | "right">("none");
  const tracking = useRef(false);
  const didDrag = useRef(false);
  const startX = useRef(0);
  const startTime = useRef(0);
  const currentOffset = useRef(0);

  const leftWidth = leftActions ? leftCount * ACTION_WIDTH_PX : 0;
  const rightWidth = rightActions ? rightCount * ACTION_WIDTH_PX : 0;

  const leftThreshold = leftWidth * 0.3;
  const rightThreshold = rightWidth * 0.3;

  useEffect(() => {
    if (forceClose && revealed !== "none") {
      setRevealed("none");
      setOffset(0);
      currentOffset.current = 0;
    }
  }, [forceClose, revealed]);

  useEffect(() => {
    const handleMove = (e: globalThis.PointerEvent): void => {
      if (!tracking.current) return;
      const delta = e.clientX - startX.current;
      let clamped = delta;
      if (!rightActions && delta > 0) clamped = 0;
      if (!leftActions && delta < 0) clamped = 0;
      if (delta < 0) clamped = Math.max(-leftWidth, delta);
      if (delta > 0) clamped = Math.min(rightWidth, delta);
      currentOffset.current = clamped;
      setOffset(clamped);
      if (Math.abs(delta) > 3) didDrag.current = true;
    };

    const handleUp = (e: globalThis.PointerEvent): void => {
      if (!tracking.current) return;
      tracking.current = false;
      const current = currentOffset.current;
      const elapsed = e.timeStamp - startTime.current;
      const velocity = Math.abs(current) / Math.max(elapsed, 1);
      const isFastFlick = velocity > VELOCITY_THRESHOLD && Math.abs(current) > MIN_DISTANCE_PX;

      if ((current < -leftThreshold || (isFastFlick && current < 0)) && leftActions) {
        setRevealed("left");
        setOffset(-leftWidth);
        currentOffset.current = -leftWidth;
        onOpen?.();
      } else if ((current > rightThreshold || (isFastFlick && current > 0)) && rightActions) {
        setRevealed("right");
        setOffset(rightWidth);
        currentOffset.current = rightWidth;
        onOpen?.();
      } else {
        setRevealed("none");
        setOffset(0);
        currentOffset.current = 0;
      }
    };

    const handleCancel = (): void => {
      if (!tracking.current) return;
      tracking.current = false;
      setRevealed("none");
      setOffset(0);
      currentOffset.current = 0;
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    document.addEventListener("pointercancel", handleCancel);
    return () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
      document.removeEventListener("pointercancel", handleCancel);
    };
  }, [leftActions, rightActions, leftWidth, rightWidth, leftThreshold, rightThreshold, onOpen]);

  const handlePointerDown = useCallback((event: ReactPointerEvent) => {
    startX.current = event.clientX;
    startTime.current = event.timeStamp;
    currentOffset.current = 0;
    tracking.current = true;
    didDrag.current = false;
  }, []);

  const handleContentClick = useCallback(() => {
    // After a drag, the browser fires click on mouse — ignore it
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    if (revealed !== "none") {
      setRevealed("none");
      setOffset(0);
      currentOffset.current = 0;
    }
  }, [revealed]);

  const handleActionClick = useCallback(() => {
    setRevealed("none");
    setOffset(0);
    currentOffset.current = 0;
  }, []);

  return (
    <div className="swipeable-row" data-testid={TEST_ID_SWIPEABLE_ROW}>
      {rightActions && (
        <div className="swipeable-actions swipeable-actions--right" style={{ width: `${rightWidth}px` }} onClick={handleActionClick}>
          {rightActions}
        </div>
      )}
      {leftActions && (
        <div className="swipeable-actions swipeable-actions--left" style={{ width: `${leftWidth}px` }} onClick={handleActionClick}>
          {leftActions}
        </div>
      )}
      <div
        className="swipeable-content"
        style={{
          transform: `translateX(${offset}px)`,
          transition: tracking.current ? "none" : "transform 200ms ease-out",
          touchAction: "pan-y",
        }}
        onPointerDown={handlePointerDown}
        onClick={handleContentClick}
      >
        {children}
      </div>
    </div>
  );
}
