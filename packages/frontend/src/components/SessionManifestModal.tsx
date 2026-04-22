import { useState, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { IonInput, IonText } from "@ionic/react";
import { CTS_SESSION_MANIFEST_UPDATE, interpolateStreamTitle } from "@invisible-av-booth/shared";
import { useStore } from "../store";
import { useSocket } from "../providers/SocketProvider";
import { Modal } from "./Modal";
import { ScriptureReferenceInput } from "./scripture/ScriptureReferenceInput";
import type { SessionManifest, ScriptureReference, CommandResult } from "../types";

const ACK_TIMEOUT = 5000;

interface SessionManifestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SessionManifestModal({ isOpen, onClose }: SessionManifestModalProps): ReactNode {
  const storeManifest = useStore((s) => s.manifest);
  const obsState = useStore((s) => s.obsState);
  const socket = useSocket();

  const [speaker, setSpeaker] = useState("");
  const [title, setTitle] = useState("");
  const [bookId, setBookId] = useState<number | null>(null);
  const [chapter, setChapter] = useState<number | null>(null);
  const [verse, setVerse] = useState<number | null>(null);
  const [verseEnd, setVerseEnd] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const preview = useMemo(() => {
    const draft: Partial<SessionManifest> = {};
    if (speaker) draft.speaker = speaker;
    if (title) draft.title = title;
    if (bookId && chapter && verse) {
      const reference: ScriptureReference = { bookId, chapter, verse };
      if (verseEnd) reference.verseEnd = verseEnd;
      draft.scripture = reference;
    }
    return interpolateStreamTitle(draft);
  }, [speaker, title, bookId, chapter, verse, verseEnd]);

  useEffect(() => {
    if (isOpen) {
      setSpeaker(storeManifest.speaker ?? "");
      setTitle(storeManifest.title ?? "");
      if (storeManifest.scripture) {
        setBookId(storeManifest.scripture.bookId);
        setChapter(storeManifest.scripture.chapter);
        setVerse(storeManifest.scripture.verse);
        setVerseEnd(storeManifest.scripture.verseEnd ?? null);
      } else {
        setBookId(null);
        setChapter(null);
        setVerse(null);
        setVerseEnd(null);
      }
      setError("");
    }
  }, [isOpen, storeManifest]);

  const buildManifest = (): Partial<SessionManifest> => {
    const patch: Partial<SessionManifest> = {};
    if (speaker) patch.speaker = speaker;
    if (title) patch.title = title;
    if (bookId && chapter && verse) {
      const reference: ScriptureReference = { bookId, chapter, verse };
      if (verseEnd) reference.verseEnd = verseEnd;
      patch.scripture = reference;
    }
    return patch;
  };

  const handleSave = (): void => {
    if (!socket) return;
    setSaving(true);
    setError("");
    const timeout = setTimeout(() => {
      setSaving(false);
      setError("Save failed — check your connection and try again.");
    }, ACK_TIMEOUT);
    socket.emit(CTS_SESSION_MANIFEST_UPDATE, buildManifest(), (result: CommandResult) => {
      clearTimeout(timeout);
      setSaving(false);
      if (result.success) onClose();
      else setError(result.error);
    });
  };

  const handleClear = (): void => {
    setSpeaker("");
    setTitle("");
    setBookId(null);
    setChapter(null);
    setVerse(null);
    setVerseEnd(null);
    setError("");
  };

  const isLive = obsState.streaming || obsState.recording;

  const footer = (
    <div className="manifest-footer">
      <button
        data-testid="manifest-clear"
        onClick={handleClear}
        disabled={saving || isLive}
        className={`button-ghost-danger button-padding-compact ${saving || isLive ? "opacity-disabled" : ""}`}
      >
        Clear All
      </button>
      <span className="fill-remaining" />
      <button
        data-testid="manifest-cancel"
        onClick={onClose}
        disabled={saving}
        className="button-outline button-padding-standard"
      >
        Cancel
      </button>
      <button
        data-testid="manifest-save"
        onClick={handleSave}
        disabled={saving}
        className={`button-primary text-bold button-padding-standard ${saving ? "opacity-disabled" : ""}`}
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="small" header="Session Details" footer={footer}>
      <div data-testid="session-manifest-modal" className="manifest-form">
        <IonInput
          data-testid="manifest-speaker"
          label="Speaker"
          labelPlacement="stacked"
          fill="outline"
          value={speaker}
          onIonInput={(e) => setSpeaker(e.detail.value ?? "")}
          clearInput
        />
        <IonInput
          data-testid="manifest-title"
          label="Sermon Title"
          labelPlacement="stacked"
          fill="outline"
          value={title}
          onIonInput={(e) => setTitle(e.detail.value ?? "")}
          clearInput
        />

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

        <div data-testid="manifest-preview" className="manifest-preview">
          <span className="text-muted">Stream title preview</span>
          <p className="text-bold margin-top-tight margin-none">{preview}</p>
        </div>

        {error && (
          <IonText color="danger" data-testid="manifest-save-error">
            <p className="margin-none text-secondary">{error}</p>
          </IonText>
        )}
      </div>
    </Modal>
  );
}
