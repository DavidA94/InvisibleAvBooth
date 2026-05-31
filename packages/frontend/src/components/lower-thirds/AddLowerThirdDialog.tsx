import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { IonButton, IonInput, IonToggle } from "@ionic/react";
import {
  TEST_ID_LT_ADD_DIALOG,
  TEST_ID_LT_ADD_TITLE_INPUT,
  TEST_ID_LT_ADD_SUBTITLE_INPUT,
  TEST_ID_LT_ADD_AUTODISMISS_TOGGLE,
  TEST_ID_LT_ADD_AUTODISMISS_DURATION,
  TEST_ID_LT_ADD_CANCEL,
  TEST_ID_LT_ADD_SAVE,
} from "../../constants/testIds";
import type { LowerThirdType, AddLowerThirdInput, ScriptureReference } from "@invisible-av-booth/shared";
import { Modal } from "../Modal";
import { ScriptureReferenceInput } from "../scripture/ScriptureReferenceInput";

interface AddLowerThirdDialogProps {
  type: LowerThirdType;
  onSave: (input: AddLowerThirdInput) => void;
  onGoLive: (input: AddLowerThirdInput) => void;
  onCancel: () => void;
}

export function AddLowerThirdDialog({ type, onSave, onGoLive, onCancel }: AddLowerThirdDialogProps): ReactNode {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [bookId, setBookId] = useState<number | null>(null);
  const [chapter, setChapter] = useState<number | null>(null);
  const [verse, setVerse] = useState<number | null>(null);
  const [verseEnd, setVerseEnd] = useState<number | null>(null);
  const [autoDismissEnabled, setAutoDismissEnabled] = useState(false);
  const [autoDismissSeconds, setAutoDismissSeconds] = useState(10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const titleRef = useRef<any>(null);

  useEffect(() => {
    if (type !== "Scripture") {
      setTimeout(() => titleRef.current?.setFocus(), 100);
    }
  }, [type]);

  const isValid = (): boolean => {
    if (type === "Title") return title.trim().length > 0;
    if (type === "TitleSubtitle") return title.trim().length > 0 && subtitle.trim().length > 0;
    if (type === "Scripture") return bookId !== null && chapter !== null && verse !== null;
    return false;
  };

  const buildInput = (): AddLowerThirdInput => {
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
    return input;
  };

  const handleSave = (): void => {
    onSave(buildInput());
  };

  const handleGoLive = (): void => {
    onGoLive(buildInput());
  };

  const footer = (
    <div className="layout-row gap-standard" style={{ justifyContent: "space-between" }}>
      <IonButton color="success" onClick={handleGoLive} disabled={!isValid()}>
        Go Live
      </IonButton>
      <div className="layout-row gap-standard">
        <IonButton fill="outline" onClick={onCancel} data-testid={TEST_ID_LT_ADD_CANCEL}>
          Cancel
        </IonButton>
        <IonButton onClick={handleSave} disabled={!isValid()} data-testid={TEST_ID_LT_ADD_SAVE}>
          Save
        </IonButton>
      </div>
    </div>
  );

  return (
    <Modal isOpen={true} onClose={onCancel} header={`Add ${type === "TitleSubtitle" ? "Title + Subtitle" : type}`} footer={footer}>
      <div data-testid={TEST_ID_LT_ADD_DIALOG} className="layout-column gap-standard">
        {(type === "Title" || type === "TitleSubtitle") && (
          <IonInput
            ref={titleRef}
            label="Title"
            labelPlacement="stacked"
            fill="outline"
            autocapitalize="words"
            value={title}
            onIonInput={(event) => setTitle(event.detail.value ?? "")}
            data-testid={TEST_ID_LT_ADD_TITLE_INPUT}
          />
        )}

        {type === "TitleSubtitle" && (
          <IonInput
            label="Subtitle"
            labelPlacement="stacked"
            fill="outline"
            autocapitalize="words"
            value={subtitle}
            onIonInput={(event) => setSubtitle(event.detail.value ?? "")}
            data-testid={TEST_ID_LT_ADD_SUBTITLE_INPUT}
          />
        )}

        {type === "Scripture" && (
          <ScriptureReferenceInput
            bookId={bookId}
            chapter={chapter}
            verse={verse}
            verseEnd={verseEnd}
            onBookChange={setBookId}
            onChapterChange={setChapter}
            onVerseChange={setVerse}
            onVerseEndChange={setVerseEnd}
            autoFocus
          />
        )}

        <div className="layout-row gap-standard align-center">
          <IonToggle
            checked={autoDismissEnabled}
            onIonChange={(event) => setAutoDismissEnabled(event.detail.checked)}
            data-testid={TEST_ID_LT_ADD_AUTODISMISS_TOGGLE}
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
            data-testid={TEST_ID_LT_ADD_AUTODISMISS_DURATION}
            style={{ maxWidth: "5rem" }}
          />
          <span className="text-muted">seconds</span>
        </div>
      </div>
    </Modal>
  );
}
