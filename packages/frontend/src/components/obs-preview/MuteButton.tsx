import type { ReactNode } from "react";
import { IonIcon } from "@ionic/react";
import { volumeMuteOutline, volumeHighOutline } from "ionicons/icons";
import { TEST_ID_OBS_PREVIEW_MUTE_BUTTON } from "../../constants/testIds";

interface MuteButtonProps {
  muted: boolean;
  onToggle: () => void;
}

export function MuteButton({ muted, onToggle }: MuteButtonProps): ReactNode {
  return (
    <button
      data-testid={TEST_ID_OBS_PREVIEW_MUTE_BUTTON}
      className="preview-mute-btn"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={muted ? "Unmute Local Audio" : "Mute Local Audio"}
      type="button"
    >
      <IonIcon icon={muted ? volumeMuteOutline : volumeHighOutline} />
      <span className="preview-mute-label">Local Audio</span>
    </button>
  );
}
