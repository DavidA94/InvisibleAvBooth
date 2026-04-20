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
    <div data-testid="obs-metadata-preview" style={{ height: "3rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <div
        id={triggerId}
        style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: empty ? "default" : "pointer" }}
        onClick={() => !empty && setPopoverOpen(true)}
        onKeyDown={(e) => e.key === "Enter" && !empty && setPopoverOpen(true)}
        role={empty ? undefined : "button"}
        tabIndex={empty ? undefined : 0}
      >
        {empty ? <span style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>No session details set</span> : interpolatedStreamTitle}
      </div>
      <button
        data-testid="edit-details-btn"
        onClick={onEditDetails}
        style={{
          background: "none",
          border: "none",
          color: "var(--color-text)",
          cursor: "pointer",
          fontSize: "1.125rem",
          width: "2.5rem",
          height: "2.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
        aria-label="Edit Details"
      >
        ✏
      </button>
      <IonPopover isOpen={popoverOpen} onDidDismiss={() => setPopoverOpen(false)} trigger={triggerId} side="bottom" alignment="start">
        <div style={{ padding: "0.75rem", maxWidth: "20rem" }}>{interpolatedStreamTitle}</div>
      </IonPopover>
    </div>
  );
}
