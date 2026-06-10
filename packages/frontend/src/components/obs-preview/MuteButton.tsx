import type { ReactNode } from "react";
import { TEST_ID_OBS_PREVIEW_MUTE_BTN } from "../../constants/testIds";

interface MuteButtonProps {
  muted: boolean;
  onToggle: () => void;
}

export function MuteButton({ muted, onToggle }: MuteButtonProps): ReactNode {
  return (
    <button
      data-testid={TEST_ID_OBS_PREVIEW_MUTE_BTN}
      className="preview-mute-btn"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={muted ? "Unmute Local Audio" : "Mute Local Audio"}
      type="button"
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
