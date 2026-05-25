import { TEST_ID_LT_EDIT_DIALOG, TEST_ID_LT_EDIT_TITLE_INPUT, TEST_ID_LT_EDIT_SUBTITLE_INPUT, TEST_ID_LT_EDIT_SCRIPTURE_INPUT, TEST_ID_LT_EDIT_AUTODISMISS_TOGGLE, TEST_ID_LT_EDIT_AUTODISMISS_DURATION, TEST_ID_LT_EDIT_CANCEL, TEST_ID_LT_EDIT_SAVE } from "../../constants/testIds";
import { useState } from "react";
import type { ReactNode } from "react";
import { IonButton } from "@ionic/react";
import type { LowerThirdItem, EditLowerThirdInput, ScriptureReference, TitleContent, TitleSubtitleContent, ScriptureContent } from "@invisible-av-booth/shared";
import { ScriptureReferenceInput } from "../scripture/ScriptureReferenceInput";

interface EditLowerThirdDialogProps {
  item: LowerThirdItem;
  onSave: (itemId: string, patch: EditLowerThirdInput) => void;
  onCancel: () => void;
}

export function EditLowerThirdDialog({ item, onSave, onCancel }: EditLowerThirdDialogProps): ReactNode {
  const [title, setTitle] = useState(() => {
    if (item.type === "Title") return (item.content as TitleContent).title;
    if (item.type === "TitleSubtitle") return (item.content as TitleSubtitleContent).title;
    return "";
  });
  const [subtitle, setSubtitle] = useState(() => {
    if (item.type === "TitleSubtitle") return (item.content as TitleSubtitleContent).subtitle;
    return "";
  });
  const [bookId, setBookId] = useState<number | null>(() => {
    if (item.type === "Scripture") return (item.content as ScriptureContent).reference.bookId;
    return null;
  });
  const [chapter, setChapter] = useState<number | null>(() => {
    if (item.type === "Scripture") return (item.content as ScriptureContent).reference.chapter;
    return null;
  });
  const [verse, setVerse] = useState<number | null>(() => {
    if (item.type === "Scripture") return (item.content as ScriptureContent).reference.verse;
    return null;
  });
  const [verseEnd, setVerseEnd] = useState<number | null>(() => {
    if (item.type === "Scripture") return (item.content as ScriptureContent).reference.verseEnd ?? null;
    return null;
  });
  const [autoDismissEnabled, setAutoDismissEnabled] = useState(item.autoDismissMs !== null);
  const [autoDismissSeconds, setAutoDismissSeconds] = useState(item.autoDismissMs ? item.autoDismissMs / 1000 : 10);

  const isValid = (): boolean => {
    if (item.type === "Title") return title.trim().length > 0;
    if (item.type === "TitleSubtitle") return title.trim().length > 0 && subtitle.trim().length > 0;
    if (item.type === "Scripture") return bookId !== null && chapter !== null && verse !== null;
    return false;
  };

  const handleSave = (): void => {
    const patch: EditLowerThirdInput = {};

    if (item.type === "Title") {
      patch.content = { title: title.trim() };
    } else if (item.type === "TitleSubtitle") {
      patch.content = { title: title.trim(), subtitle: subtitle.trim() };
    } else if (item.type === "Scripture" && bookId !== null && chapter !== null && verse !== null) {
      const reference: ScriptureReference = { bookId, chapter, verse };
      if (verseEnd !== null) reference.verseEnd = verseEnd;
      patch.content = { reference };
    }

    if (autoDismissEnabled) {
      patch.autoDismissMs = autoDismissSeconds * 1000;
    }

    onSave(item.id, patch);
  };

  return (
    <div className="lt-dialog-backdrop" data-testid={TEST_ID_LT_EDIT_DIALOG}>
      <div className="lt-dialog-modal">
        <h3 className="lt-dialog-title">
          Edit {item.type === "TitleSubtitle" ? "Title + Subtitle" : item.type}
        </h3>

        <div className="lt-dialog-fields">
          {(item.type === "Title" || item.type === "TitleSubtitle") && (
            <label className="lt-dialog-field">
              <span>Title</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                data-testid={TEST_ID_LT_EDIT_TITLE_INPUT}
              />
            </label>
          )}

          {item.type === "TitleSubtitle" && (
            <label className="lt-dialog-field">
              <span>Subtitle</span>
              <input
                type="text"
                value={subtitle}
                onChange={(event) => setSubtitle(event.target.value)}
                data-testid={TEST_ID_LT_EDIT_SUBTITLE_INPUT}
              />
            </label>
          )}

          {item.type === "Scripture" && (
            <div className="lt-dialog-field" data-testid={TEST_ID_LT_EDIT_SCRIPTURE_INPUT}>
              <span>Scripture Reference</span>
              <ScriptureReferenceInput
                bookId={bookId}
                chapter={chapter}
                verse={verse}
                verseEnd={verseEnd}
                onBookChange={setBookId}
                onChapterChange={setChapter}
                onVerseChange={setVerse}
                onVerseEndChange={setVerseEnd}
              />
            </div>
          )}

          <label className="lt-dialog-field lt-dialog-toggle">
            <span>Auto-Dismiss</span>
            <input
              type="checkbox"
              checked={autoDismissEnabled}
              onChange={(event) => setAutoDismissEnabled(event.target.checked)}
              data-testid={TEST_ID_LT_EDIT_AUTODISMISS_TOGGLE}
            />
          </label>

          {autoDismissEnabled && (
            <label className="lt-dialog-field">
              <span>Duration (seconds)</span>
              <input
                type="number"
                min={1}
                max={300}
                value={autoDismissSeconds}
                onChange={(event) => setAutoDismissSeconds(Math.max(1, parseInt(event.target.value) || 10))}
                data-testid={TEST_ID_LT_EDIT_AUTODISMISS_DURATION}
              />
            </label>
          )}
        </div>

        <div className="lt-dialog-actions">
          <IonButton fill="outline" onClick={onCancel} data-testid={TEST_ID_LT_EDIT_CANCEL}>
            Cancel
          </IonButton>
          <IonButton onClick={handleSave} disabled={!isValid()} data-testid={TEST_ID_LT_EDIT_SAVE}>
            Save
          </IonButton>
        </div>
      </div>
    </div>
  );
}
