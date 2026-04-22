import { useState } from "react";
import type { ReactNode } from "react";
import { IonPopover } from "@ionic/react";

interface ObsMetadataPreviewProps {
  interpolatedStreamTitle: string;
  onEditDetails: () => void;
}

let previewCounter = 0;

export function ObsMetadataPreview({ interpolatedStreamTitle, onEditDetails }: ObsMetadataPreviewProps): ReactNode {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [triggerId] = useState(() => `obs-preview-${++previewCounter}`);
  const empty = !interpolatedStreamTitle;

  return (
    <div data-testid="obs-metadata-preview" className="obs-metadata-preview">
      <div
        id={triggerId}
        className="obs-preview-text"
        style={{ cursor: empty ? "default" : "pointer" }}
        onClick={() => !empty && setPopoverOpen(true)}
        onKeyDown={(e) => e.key === "Enter" && !empty && setPopoverOpen(true)}
        role={empty ? undefined : "button"}
        tabIndex={empty ? undefined : 0}
      >
        {empty ? <span className="text-muted text-italic">No session details set</span> : interpolatedStreamTitle}
      </div>
      <button data-testid="edit-details-btn" onClick={onEditDetails} className="obs-edit-button" aria-label="Edit Details">
        ✏
      </button>
      <IonPopover isOpen={popoverOpen} onDidDismiss={() => setPopoverOpen(false)} trigger={triggerId} side="bottom" alignment="start">
        <div className="popover-content">{interpolatedStreamTitle}</div>
      </IonPopover>
    </div>
  );
}
