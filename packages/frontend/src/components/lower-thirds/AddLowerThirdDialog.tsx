import { useState } from "react";
import type { ReactNode } from "react";
import { IonButton, IonInput, IonToggle, IonModal, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons } from "@ionic/react";
import { TEST_ID_LT_ADD_DIALOG, TEST_ID_LT_ADD_TITLE_INPUT, TEST_ID_LT_ADD_SUBTITLE_INPUT, TEST_ID_LT_ADD_SCRIPTURE_INPUT, TEST_ID_LT_ADD_AUTODISMISS_TOGGLE, TEST_ID_LT_ADD_AUTODISMISS_DURATION, TEST_ID_LT_ADD_CANCEL, TEST_ID_LT_ADD_SAVE } from "../../constants/testIds";
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
    <IonModal isOpen={true} onDidDismiss={onCancel} data-testid={TEST_ID_LT_ADD_DIALOG}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Add {type === "TitleSubtitle" ? "Title + Subtitle" : type}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onCancel} data-testid={TEST_ID_LT_ADD_CANCEL}>Cancel</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        {(type === "Title" || type === "TitleSubtitle") && (
          <IonInput
            label="Title"
            labelPlacement="stacked"
            fill="outline"
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
            value={subtitle}
            onIonInput={(event) => setSubtitle(event.detail.value ?? "")}
            className="ion-margin-top"
            data-testid={TEST_ID_LT_ADD_SUBTITLE_INPUT}
          />
        )}

        {type === "Scripture" && (
          <div className="ion-margin-top" data-testid={TEST_ID_LT_ADD_SCRIPTURE_INPUT}>
            <p className="ion-margin-bottom">Scripture Reference</p>
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

        <div className="ion-margin-top">
          <IonToggle
            checked={autoDismissEnabled}
            onIonChange={(event) => setAutoDismissEnabled(event.detail.checked)}
            data-testid={TEST_ID_LT_ADD_AUTODISMISS_TOGGLE}
          >
            Auto-Dismiss
          </IonToggle>
        </div>

        {autoDismissEnabled && (
          <IonInput
            type="number"
            label="Duration (seconds)"
            labelPlacement="stacked"
            fill="outline"
            min={1}
            max={300}
            value={autoDismissSeconds}
            onIonInput={(event) => setAutoDismissSeconds(Math.max(1, parseInt(event.detail.value ?? "10") || 10))}
            className="ion-margin-top"
            data-testid={TEST_ID_LT_ADD_AUTODISMISS_DURATION}
          />
        )}

        <IonButton expand="block" className="ion-margin-top" onClick={handleSave} disabled={!isValid()} data-testid={TEST_ID_LT_ADD_SAVE}>
          Save
        </IonButton>
      </IonContent>
    </IonModal>
  );
}
