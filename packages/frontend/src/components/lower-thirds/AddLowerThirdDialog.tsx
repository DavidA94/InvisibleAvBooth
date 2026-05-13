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
    <div className="lt-dialog-backdrop" data-testid="lt-add-dialog">
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
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter title text"
                data-testid="lt-add-title-input"
              />
            </label>
          )}

          {type === "TitleSubtitle" && (
            <label className="lt-dialog-field">
              <span>Subtitle</span>
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="Enter subtitle text"
                data-testid="lt-add-subtitle-input"
              />
            </label>
          )}

          {type === "Scripture" && (
            <div className="lt-dialog-field" data-testid="lt-add-scripture-input">
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
              onChange={(e) => setAutoDismissEnabled(e.target.checked)}
              data-testid="lt-add-autodismiss-toggle"
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
                onChange={(e) => setAutoDismissSeconds(Math.max(1, parseInt(e.target.value) || 10))}
                data-testid="lt-add-autodismiss-duration"
              />
            </label>
          )}
        </div>

        <div className="lt-dialog-actions">
          <IonButton fill="outline" onClick={onCancel} data-testid="lt-add-cancel">
            Cancel
          </IonButton>
          <IonButton onClick={handleSave} disabled={!isValid()} data-testid="lt-add-save">
            Save
          </IonButton>
        </div>
      </div>
    </div>
  );
}
