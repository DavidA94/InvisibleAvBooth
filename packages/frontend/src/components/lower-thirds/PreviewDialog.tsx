import { TEST_ID_LOWER_THIRD_PREVIEW_DIALOG, TEST_ID_LOWER_THIRD_PREVIEW_GO_LIVE, TEST_ID_LOWER_THIRD_PREVIEW_CANCEL } from "../../constants/testIds";
import type { ReactNode } from "react";
import { IonButton } from "@ionic/react";
import type { LowerThirdItem, TitleContent, TitleSubtitleContent, ScriptureContent } from "@invisible-av-booth/shared";

interface PreviewDialogProps {
  item: LowerThirdItem;
  transitionLocked: boolean;
  onGoLive: () => void;
  onCancel: () => void;
}

function renderContent(item: LowerThirdItem): ReactNode {
  switch (item.type) {
    case "Title": {
      const content = item.content as TitleContent;
      return <p className="lt-preview-title">{content.title}</p>;
    }
    case "TitleSubtitle": {
      const content = item.content as TitleSubtitleContent;
      return (
        <>
          <p className="lt-preview-title">{content.title}</p>
          <p className="lt-preview-subtitle">{content.subtitle}</p>
        </>
      );
    }
    case "Scripture": {
      const content = item.content as ScriptureContent;
      return (
        <>
          <p className="lt-preview-reference">{content.formattedReference}</p>
          {content.verses.length > 0 && (
            <div className="lt-preview-verses">
              {content.verses.map((verse) => (
                <p key={verse.verseNumber} className="lt-preview-verse">
                  {verse.verseNumber > 0 && <span className="lt-preview-verse-num">{verse.verseNumber}. </span>}
                  {verse.text}
                </p>
              ))}
            </div>
          )}
        </>
      );
    }
  }
}

export function PreviewDialog({ item, transitionLocked, onGoLive, onCancel }: PreviewDialogProps): ReactNode {
  return (
    <div className="lt-preview-backdrop" data-testid={TEST_ID_LOWER_THIRD_PREVIEW_DIALOG}>
      <div className="lt-preview-modal">
        <div className="lt-preview-header">
          <span className="lt-preview-type">{item.type}</span>
          <span className="lt-preview-style">{item.style}</span>
        </div>

        <div className="lt-preview-content">{renderContent(item)}</div>

        {item.pages && item.pages.totalPages > 1 && <p className="lt-preview-pages">{item.pages.totalPages} pages</p>}

        <div className="lt-preview-actions">
          <IonButton fill="outline" onClick={onCancel} data-testid={TEST_ID_LOWER_THIRD_PREVIEW_CANCEL}>
            Cancel
          </IonButton>
          <IonButton color="success" onClick={onGoLive} disabled={transitionLocked} data-testid={TEST_ID_LOWER_THIRD_PREVIEW_GO_LIVE}>
            {transitionLocked ? "Transitioning..." : "Go Live"}
          </IonButton>
        </div>
      </div>
    </div>
  );
}
