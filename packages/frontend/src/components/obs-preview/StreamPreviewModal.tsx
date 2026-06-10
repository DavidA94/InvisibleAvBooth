import type { ReactNode, RefObject } from "react";
import { MuteButton } from "./MuteButton";
import { TEST_ID_STREAM_PREVIEW_MODAL, TEST_ID_STREAM_PREVIEW_DISMISS } from "../../constants/testIds";

interface StreamPreviewModalProps {
  open: boolean;
  onDismiss: () => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  muted: boolean;
  onToggleMute: () => void;
}

export function StreamPreviewModal({ open, onDismiss, videoRef, muted, onToggleMute }: StreamPreviewModalProps): ReactNode {
  if (!open) return null;

  return (
    <div data-testid={TEST_ID_STREAM_PREVIEW_MODAL} className="preview-modal-backdrop" onClick={onDismiss}>
      <div className="preview-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="preview-modal-header">
          <span className="text-bold">Stream Preview</span>
          <button data-testid={TEST_ID_STREAM_PREVIEW_DISMISS} className="preview-modal-dismiss" onClick={onDismiss} type="button" aria-label="Close preview">
            ✕
          </button>
        </div>
        <div className="preview-video-container">
          <video ref={videoRef} className="preview-video" autoPlay playsInline muted={muted} />
          <MuteButton muted={muted} onToggle={onToggleMute} />
        </div>
      </div>
    </div>
  );
}
