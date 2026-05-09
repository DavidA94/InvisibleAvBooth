import { useState } from "react";
import type { ReactNode } from "react";
import { IonPopover } from "@ionic/react";
import { TEST_ID_OBS_METADATA_PREVIEW, TEST_ID_EDIT_DETAILS_BUTTON } from "../../constants/testIds";

interface ObsMetadataPreviewProps {
  interpolatedStreamTitle: string;
  interpolatedDescription?: string;
  onEditDetails: () => void;
}

let previewCounter = 0;

export function ObsMetadataPreview({ interpolatedStreamTitle, interpolatedDescription, onEditDetails }: ObsMetadataPreviewProps): ReactNode {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [triggerId] = useState(() => `obs-preview-${++previewCounter}`);
  const empty = !interpolatedStreamTitle;

  return (
    <div data-testid={TEST_ID_OBS_METADATA_PREVIEW} className="obs-metadata-preview">
      <div
        id={triggerId}
        className={`obs-preview-text ${empty ? "" : "cursor-pointer"}`}
        onClick={() => !empty && setPopoverOpen(true)}
        onKeyDown={(e) => e.key === "Enter" && !empty && setPopoverOpen(true)}
        role={empty ? undefined : "button"}
        tabIndex={empty ? undefined : 0}
      >
        {empty ? (
          <span className="text-muted text-italic">No session details set</span>
        ) : (
          <>
            <div className="text-ellipsis">{interpolatedStreamTitle}</div>
            {interpolatedDescription && (
              <div className="text-muted text-ellipsis obs-description-line">
                {interpolatedDescription.split("\n")[0]}
                {interpolatedDescription.includes("\n") ? " …" : ""}
              </div>
            )}
          </>
        )}
      </div>
      <button data-testid={TEST_ID_EDIT_DETAILS_BUTTON} onClick={onEditDetails} className="obs-edit-button" aria-label="Edit Details">
        ✏
      </button>
      <IonPopover isOpen={popoverOpen} onDidDismiss={() => setPopoverOpen(false)} trigger={triggerId} side="bottom" alignment="start">
        <div className="popover-content">
          <div className="text-medium">{interpolatedStreamTitle}</div>
          {interpolatedDescription && <div className="text-muted text-secondary margin-top-tight whitespace-pre-wrap">{interpolatedDescription}</div>}
        </div>
      </IonPopover>
    </div>
  );
}
