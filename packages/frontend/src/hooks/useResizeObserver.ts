import { useState, useEffect } from "react";
import type { RefObject } from "react";

/**
 * Observes an element's content width via ResizeObserver.
 * Returns the current width in CSS pixels. Cleans up on unmount.
 */
export function useResizeObserver(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setWidth(entry.contentRect.width);
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}
