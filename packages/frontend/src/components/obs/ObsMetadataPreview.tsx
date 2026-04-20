import { useState } from "react";
import type { ReactNode } from "react";
import { IonPopover } from "@ionic/react";

interface ObsMetadataPreviewProps {
  interpolatedStreamTitle: string;
}

export function ObsMetadataPreview({ interpolatedStreamTitle }: ObsMetadataPreviewProps): ReactNode {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const empty = !interpolatedStreamTitle;

  return (
    <div
      data-testid="obs-metadata-preview"
      style={{ height: "3rem", display: "flex", alignItems: "center", cursor: "pointer" }}
      onClick={() => !empty && setPopoverOpen(true)}
      onKeyDown={(e) => e.key === "Enter" && !empty && setPopoverOpen(true)}
      role="button"
      tabIndex={0}
    >
      {empty ? (
        <span style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>No session details set</span>
      ) : (
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>{interpolatedStreamTitle}</span>
      )}
      <IonPopover isOpen={popoverOpen} onDidDismiss={() => setPopoverOpen(false)}>
        <div style={{ padding: "0.75rem", maxWidth: "20rem" }}>{interpolatedStreamTitle}</div>
      </IonPopover>
    </div>
  );
}
