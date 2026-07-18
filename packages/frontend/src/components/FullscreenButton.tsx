import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { IonIcon } from "@ionic/react";
import { expandOutline, contractOutline } from "ionicons/icons";
import { TEST_ID_FULLSCREEN_BUTTON } from "../constants/testIds";

/**
 * Fullscreen toggle button for the global title bar.
 * Returns null if the Fullscreen API is not supported (e.g., some iOS WebViews).
 * Uses document.fullscreenEnabled for feature detection (+ webkit prefix for Safari).
 * State is tracked via fullscreenchange events, not just the button's own actions,
 * so the icon stays correct even when fullscreen is exited via Escape or OS gestures.
 */
export function FullscreenButton(): ReactNode {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Feature detection — don't render if unsupported
  const supported =
    typeof document !== "undefined" &&
    (document.fullscreenEnabled || (document as Document & { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled === true);

  useEffect(() => {
    if (!supported) return;

    const handler = (): void => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
    };
  }, [supported]);

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Fullscreen not permitted (permissions policy, iOS WebView restrictions, etc.)
      // The fullscreenchange event won't fire, so the button icon remains consistent.
    }
  }, []);

  if (!supported) return null;

  return (
    <button
      data-testid={TEST_ID_FULLSCREEN_BUTTON}
      className="fullscreen-button"
      onClick={toggle}
      aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
    >
      <IonIcon icon={isFullscreen ? contractOutline : expandOutline} />
    </button>
  );
}
