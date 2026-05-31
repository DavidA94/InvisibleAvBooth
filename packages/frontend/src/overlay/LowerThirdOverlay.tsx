import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { initOverlay, destroyOverlay } from "./overlayEngine";
import "./overlay.css";
import "./styles/BlueRhombusStyle.css";

/**
 * Thin React shell for the overlay page.
 * All DOM manipulation, socket connection, and animation logic lives in
 * overlayEngine.ts (imperative, no React state or effects).
 */
export function LowerThirdOverlay(): ReactNode {
  const rootRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || !rootRef.current) return;
    initialized.current = true;
    initOverlay(rootRef.current);
    return () => {
      destroyOverlay();
      initialized.current = false;
    };
  }, []);

  return (
    <div ref={rootRef} className="overlay-root">
      <div className="aspect-ratio-jail">
        <div className="lower-third-container" />
      </div>
    </div>
  );
}
