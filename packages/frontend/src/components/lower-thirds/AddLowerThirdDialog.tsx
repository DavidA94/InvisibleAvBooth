import { TEST_ID_LT_ADD_DIALOG, TEST_ID_LT_ADD_TITLE_INPUT, TEST_ID_LT_ADD_SUBTITLE_INPUT, TEST_ID_LT_ADD_SCRIPTURE_INPUT, TEST_ID_LT_ADD_AUTODISMISS_TOGGLE, TEST_ID_LT_ADD_AUTODISMISS_DURATION, TEST_ID_LT_ADD_CANCEL, TEST_ID_LT_ADD_SAVE } from "../../constants/testIds";
import { useState } from "react";
import type { ReactNode } from "react";
import { IonButton } from "@ionic/react";
import type { LowerThirdType, AddLowerThirdInput, ScriptureReference } from "@invisible-av-booth/shared";
import { ScriptureReferenceInput } from "../scripture/ScriptureReferenceInput";

interface AddLowerThirdDialogProps {
  type: LowerThirdType;
  onSave: (input: AddLowerThirdInput) => void;
  onCancel: () => void;
}

export function AddLowerThirdDialog({ type, onSave, onCancel }: AddLowerThirdDialogProps): ReactNode {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [bookId, setBookId] = useState<number | null>(null);
  const [chapter, setChapter] = useState<number | null>(null);
  const [verse, setVerse] = useState<number | null>(null);
  const [verseEnd, setVerseEnd] = useState<number | null>(null);
  const [autoDismissEnabled, setAutoDismissEnabled] = useState(false);
  const [autoDismissSeconds, setAutoDismissSeconds] = useState(10);

  const isValid = (): boolean => {
    if (type === "Title") return title.trim().length > 0;
    if (type === "TitleSubtitle") return title.trim().length > 0 && subtitle.trim().length > 0;
    if (type === "Scripture") return bookId !== null && chapter !== null && verse !== null;
    return false;
  };

  const handleSave = (): void => {
    const input: AddLowerThirdInput = { type, content: { title: "" } };

    if (type === "Title") {
      input.content = { title: title.trim() };
    } else if (type === "TitleSubtitle") {
      input.content = { title: title.trim(), subtitle: subtitle.trim() };
    } else if (type === "Scripture" && bookId !== null && chapter !== null && verse !== null) {
      const reference: ScriptureReference = { bookId, chapter, verse };
      if (verseEnd !== null) reference.verseEnd = verseEnd;
      input.content = { reference };
    }

    if (autoDismissEnabled) {
      input.autoDismissMs = autoDismissSeconds * 1000;
    }

    onSave(input);
  };

  return (
    <div className="lt-dialog-backdrop" data-testid={TEST_ID_LT_ADD_DIALOG}>
      <div className="lt-dialog-modal">
        <h3 className="lt-dialog-title">
          Add {type === "TitleSubtitle" ? "Title + Subtitle" : type}
        </h3>

        <div className="lt-dialog-fields">
          {(type === "Title" || type === "TitleSubtitle") && (
            <label className="lt-dialog-field">
              <span>Title</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Enter title text"
                data-testid={TEST_ID_LT_ADD_TITLE_INPUT}
              />
            </label>
          )}

          {type === "TitleSubtitle" && (
            <label className="lt-dialog-field">
              <span>Subtitle</span>
              <input
                type="text"
                value={subtitle}
                onChange={(event) => setSubtitle(event.target.value)}
                placeholder="Enter subtitle text"
                data-testid={TEST_ID_LT_ADD_SUBTITLE_INPUT}
              />
            </label>
          )}

          {type === "Scripture" && (
            <div className="lt-dialog-field" data-testid={TEST_ID_LT_ADD_SCRIPTURE_INPUT}>
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
              data-testid={TEST_ID_LT_ADD_AUTODISMISS_TOGGLE}
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
                data-testid={TEST_ID_LT_ADD_AUTODISMISS_DURATION}
              />
            </label>
          )}
        </div>

        <div className="lt-dialog-actions">
          <IonButton fill="outline" onClick={onCancel} data-testid={TEST_ID_LT_ADD_CANCEL}>
            Cancel
          </IonButton>
          <IonButton onClick={handleSave} disabled={!isValid()} data-testid={TEST_ID_LT_ADD_SAVE}>
            Save
          </IonButton>
        </div>
      </div>
    </div>
  );
}
