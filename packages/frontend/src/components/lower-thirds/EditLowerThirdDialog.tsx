import { useState } from "react";
import type { ReactNode } from "react";
import { IonButton, IonInput, IonToggle } from "@ionic/react";
import { TEST_ID_LT_EDIT_DIALOG, TEST_ID_LT_EDIT_TITLE_INPUT, TEST_ID_LT_EDIT_SUBTITLE_INPUT, TEST_ID_LT_EDIT_AUTODISMISS_TOGGLE, TEST_ID_LT_EDIT_AUTODISMISS_DURATION, TEST_ID_LT_EDIT_CANCEL, TEST_ID_LT_EDIT_SAVE } from "../../constants/testIds";
import type { LowerThirdItem, EditLowerThirdInput, ScriptureReference, TitleContent, TitleSubtitleContent, ScriptureContent } from "@invisible-av-booth/shared";
import { Modal } from "../Modal";
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
  const [bookId, setBookId] = useState<number | null>(() => item.type === "Scripture" ? (item.content as ScriptureContent).reference.bookId : null);
  const [chapter, setChapter] = useState<number | null>(() => item.type === "Scripture" ? (item.content as ScriptureContent).reference.chapter : null);
  const [verse, setVerse] = useState<number | null>(() => item.type === "Scripture" ? (item.content as ScriptureContent).reference.verse : null);
  const [verseEnd, setVerseEnd] = useState<number | null>(() => item.type === "Scripture" ? (item.content as ScriptureContent).reference.verseEnd ?? null : null);
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

  const footer = (
    <div className="layout-row gap-standard justify-end">
      <IonButton fill="outline" onClick={onCancel} data-testid={TEST_ID_LT_EDIT_CANCEL}>Cancel</IonButton>
      <IonButton onClick={handleSave} disabled={!isValid()} data-testid={TEST_ID_LT_EDIT_SAVE}>Save</IonButton>
    </div>
  );

  return (
    <Modal
      isOpen={true}
      onClose={onCancel}
      header={`Edit ${item.type === "TitleSubtitle" ? "Title + Subtitle" : item.type}`}
      footer={footer}
    >
      <div data-testid={TEST_ID_LT_EDIT_DIALOG} className="layout-column gap-standard">
        {(item.type === "Title" || item.type === "TitleSubtitle") && (
          <IonInput
            label="Title"
            labelPlacement="stacked"
            fill="outline"
            autocapitalize="words"
            value={title}
            onIonInput={(event) => setTitle(event.detail.value ?? "")}
            data-testid={TEST_ID_LT_EDIT_TITLE_INPUT}
          />
        )}

        {item.type === "TitleSubtitle" && (
          <IonInput
            label="Subtitle"
            labelPlacement="stacked"
            fill="outline"
            autocapitalize="words"
            value={subtitle}
            onIonInput={(event) => setSubtitle(event.detail.value ?? "")}
            data-testid={TEST_ID_LT_EDIT_SUBTITLE_INPUT}
          />
        )}

        {item.type === "Scripture" && (
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
        )}

        <div className="layout-row gap-standard align-center">
          <IonToggle
            checked={autoDismissEnabled}
            onIonChange={(event) => setAutoDismissEnabled(event.detail.checked)}
            data-testid={TEST_ID_LT_EDIT_AUTODISMISS_TOGGLE}
          >
            Auto-Dismiss
          </IonToggle>
          <IonInput
            type="number"
            fill="outline"
            min={1}
            max={300}
            value={autoDismissSeconds}
            disabled={!autoDismissEnabled}
            onIonInput={(event) => setAutoDismissSeconds(Math.max(1, parseInt(event.detail.value ?? "10") || 10))}
            data-testid={TEST_ID_LT_EDIT_AUTODISMISS_DURATION}
            style={{ maxWidth: "5rem" }}
          />
          <span className="text-muted">seconds</span>
        </div>
      </div>
    </Modal>
  );
}
