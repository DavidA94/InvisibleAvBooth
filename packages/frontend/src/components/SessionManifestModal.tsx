import { useState, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { IonInput, IonText } from "@ionic/react";
import { BIBLE_BOOKS, CTS_SESSION_MANIFEST_UPDATE, interpolateStreamTitle } from "@invisible-av-booth/shared";
import { useStore } from "../store";
import { useSocket } from "../providers/SocketProvider";
import { Modal } from "./Modal";
import type { SessionManifest, ScriptureReference, CommandResult } from "../types";

const BOOK_ENTRIES = Object.entries(BIBLE_BOOKS).map(([id, name]) => ({ id: Number(id), name }));
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
  const [bookSearch, setBookSearch] = useState("");
  const [bookId, setBookId] = useState<number | null>(null);
  const [chapter, setChapter] = useState("");
  const [verse, setVerse] = useState("");
  const [verseEnd, setVerseEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [validationError, setValidationError] = useState("");

  const preview = useMemo(() => {
    const draft: Partial<SessionManifest> = {};
    if (speaker) draft.speaker = speaker;
    if (title) draft.title = title;
    if (bookId && chapter && verse) {
      const ref: ScriptureReference = { bookId, chapter: Number(chapter), verse: Number(verse) };
      if (verseEnd) ref.verseEnd = Number(verseEnd);
      draft.scripture = ref;
    }
    return interpolateStreamTitle(draft);
  }, [speaker, title, bookId, chapter, verse, verseEnd]);

  useEffect(() => {
    if (isOpen) {
      setSpeaker(storeManifest.speaker ?? "");
      setTitle(storeManifest.title ?? "");
      if (storeManifest.scripture) {
        setBookId(storeManifest.scripture.bookId);
        setBookSearch(BIBLE_BOOKS[storeManifest.scripture.bookId] ?? "");
        setChapter(String(storeManifest.scripture.chapter));
        setVerse(String(storeManifest.scripture.verse));
        setVerseEnd(storeManifest.scripture.verseEnd ? String(storeManifest.scripture.verseEnd) : "");
      } else {
        setBookId(null);
        setBookSearch("");
        setChapter("");
        setVerse("");
        setVerseEnd("");
      }
      setError("");
      setValidationError("");
    }
  }, [isOpen, storeManifest]);

  const bookSuggestions = useMemo(() => {
    if (!bookSearch || bookId) return [];
    const lower = bookSearch.toLowerCase();
    return BOOK_ENTRIES.filter((b) => b.name.toLowerCase().includes(lower)).slice(0, 8);
  }, [bookSearch, bookId]);

  const selectBook = (entry: { id: number; name: string }): void => {
    setBookId(entry.id);
    setBookSearch(entry.name);
  };

  const normaliseVerseEnd = (): void => {
    const v = Number(verse);
    const ve = Number(verseEnd);
    if (!verseEnd || !verse) return;
    if (ve === v) setVerseEnd("");
    else if (ve < v) {
      setVerse(String(ve));
      setVerseEnd(String(v));
    }
  };

  const validateScripture = async (): Promise<void> => {
    if (!bookId || !chapter || !verse) {
      setValidationError("");
      return;
    }
    try {
      const params = new URLSearchParams({ bookId: String(bookId), chapter, verse });
      if (verseEnd) params.set("verseEnd", verseEnd);
      const response = await fetch(`/api/kjv/validate?${params}`, { credentials: "include" });
      const data = (await response.json()) as { valid: boolean; reason?: string };
      setValidationError(data.valid ? "" : (data.reason ?? "Invalid reference"));
    } catch {
      setValidationError("");
    }
  };

  const buildManifest = (): Partial<SessionManifest> => {
    const patch: Partial<SessionManifest> = {};
    if (speaker) patch.speaker = speaker;
    if (title) patch.title = title;
    if (bookId && chapter && verse) {
      const ref: ScriptureReference = { bookId, chapter: Number(chapter), verse: Number(verse) };
      if (verseEnd) ref.verseEnd = Number(verseEnd);
      patch.scripture = ref;
    }
    return patch;
  };

  const handleSave = (): void => {
    if (!socket || validationError) return;
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
    if (!socket) return;
    setSaving(true);
    setError("");
    socket.emit(CTS_SESSION_MANIFEST_UPDATE, {}, (result: CommandResult) => {
      setSaving(false);
      if (result.success) {
        setSpeaker("");
        setTitle("");
        setBookId(null);
        setBookSearch("");
        setChapter("");
        setVerse("");
        setVerseEnd("");
      } else {
        setError(result.error);
      }
    });
  };

  const isLive = obsState.streaming || obsState.recording;

  const footer = (
    <div style={{ display: "flex", gap: "0.5rem" }}>
      <button
        data-testid="manifest-clear"
        onClick={handleClear}
        disabled={saving || isLive}
        style={{
          background: "transparent",
          color: "var(--color-danger)",
          border: "none",
          padding: "0.625rem 1rem",
          cursor: "pointer",
          opacity: saving || isLive ? 0.5 : 1,
        }}
      >
        Clear All
      </button>
      <span style={{ flex: 1 }} />
      <button
        data-testid="manifest-cancel"
        onClick={onClose}
        disabled={saving}
        style={{
          background: "transparent",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
          borderRadius: "0.375rem",
          padding: "0.625rem 1.25rem",
          cursor: "pointer",
        }}
      >
        Cancel
      </button>
      <button
        data-testid="manifest-save"
        onClick={handleSave}
        disabled={saving || !!validationError}
        style={{
          background: "var(--color-primary)",
          color: "var(--color-text)",
          border: "none",
          borderRadius: "0.375rem",
          padding: "0.625rem 1.25rem",
          fontWeight: "bold",
          cursor: "pointer",
          opacity: saving || validationError ? 0.5 : 1,
        }}
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="small" header="Session Details" footer={footer}>
      <div data-testid="session-manifest-modal" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
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

        <div style={{ position: "relative" }}>
          <IonInput
            data-testid="manifest-book"
            label="Book"
            labelPlacement="stacked"
            fill="outline"
            value={bookSearch}
            onIonInput={(e) => {
              setBookSearch(e.detail.value ?? "");
              setBookId(null);
            }}
            onIonBlur={() => void validateScripture()}
            clearInput
          />
          {bookSuggestions.length > 0 && (
            <div
              data-testid="book-suggestions"
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                background: "var(--color-surface-raised)",
                borderRadius: "0 0 0.375rem 0.375rem",
                zIndex: 100,
                maxHeight: "12rem",
                overflow: "auto",
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              }}
            >
              {bookSuggestions.map((b) => (
                <div
                  key={b.id}
                  role="option"
                  onClick={() => selectBook(b)}
                  onKeyDown={(e) => e.key === "Enter" && selectBook(b)}
                  tabIndex={0}
                  style={{ padding: "0.5rem 0.75rem", cursor: "pointer" }}
                >
                  {b.name}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <IonInput
            data-testid="manifest-chapter"
            label="Ch"
            labelPlacement="stacked"
            fill="outline"
            type="number"
            value={chapter}
            onIonInput={(e) => setChapter(e.detail.value ?? "")}
            onIonBlur={() => void validateScripture()}
            style={{ flex: 1 }}
          />
          <IonInput
            data-testid="manifest-verse"
            label="Verse"
            labelPlacement="stacked"
            fill="outline"
            type="number"
            value={verse}
            onIonInput={(e) => setVerse(e.detail.value ?? "")}
            onIonBlur={() => void validateScripture()}
            style={{ flex: 1 }}
          />
          <IonInput
            data-testid="manifest-verse-end"
            label="End"
            labelPlacement="stacked"
            fill="outline"
            type="number"
            value={verseEnd}
            onIonInput={(e) => setVerseEnd(e.detail.value ?? "")}
            onIonBlur={() => {
              normaliseVerseEnd();
              void validateScripture();
            }}
            style={{ flex: 1 }}
          />
        </div>

        {validationError && (
          <IonText color="danger" data-testid="scripture-validation-error">
            <p style={{ margin: 0, fontSize: "0.8125rem" }}>{validationError}</p>
          </IonText>
        )}

        <div
          data-testid="manifest-preview"
          style={{ background: "var(--color-surface-raised)", borderRadius: "0.375rem", padding: "0.75rem", fontSize: "0.875rem" }}
        >
          <span style={{ color: "var(--color-text-muted)", fontSize: "0.75rem" }}>Stream title preview</span>
          <p style={{ margin: "0.25rem 0 0", fontWeight: "bold" }}>{preview}</p>
        </div>

        {error && (
          <IonText color="danger" data-testid="manifest-save-error">
            <p style={{ margin: 0, fontSize: "0.875rem" }}>{error}</p>
          </IonText>
        )}
      </div>
    </Modal>
  );
}
