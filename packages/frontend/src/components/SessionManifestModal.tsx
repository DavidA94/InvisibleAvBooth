import { useState, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { IonInput, IonText } from "@ionic/react";
import { CTS_SESSION_MANIFEST_UPDATE, interpolateTemplate } from "@invisible-av-booth/shared";
import { useStore } from "../store";
import { useSocket } from "../providers/SocketProvider";
import { Modal } from "./Modal";
import { ScriptureReferenceInput } from "./scripture/ScriptureReferenceInput";
import {
  TEST_ID_SESSION_MANIFEST_MODAL,
  TEST_ID_MANIFEST_SPEAKER,
  TEST_ID_MANIFEST_TITLE,
  TEST_ID_MANIFEST_PREVIEW,
  TEST_ID_MANIFEST_SAVE,
  TEST_ID_MANIFEST_CANCEL,
  TEST_ID_MANIFEST_CLEAR,
  TEST_ID_MANIFEST_SAVE_ERROR,
  TEST_ID_MANIFEST_TITLE_TEMPLATE,
  TEST_ID_MANIFEST_DESCRIPTION_TEMPLATE,
  TEST_ID_MANIFEST_DESCRIPTION_PREVIEW,
} from "../constants/testIds";
import type { SessionManifest, ScriptureReference, CommandResult } from "../types";

const ACK_TIMEOUT = 5000;

interface Template {
  id: string;
  name: string;
  category: "title" | "description";
  formatString: string;
}

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

  const [templates, setTemplates] = useState<Template[]>([]);
  const [titleTemplateId, setTitleTemplateId] = useState<string>("");
  const [descriptionTemplateId, setDescriptionTemplateId] = useState<string>("");

  // Fetch templates when modal opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/templates", { credentials: "include" });
        if (response.ok && !cancelled) {
          const data = (await response.json()) as Template[];
          setTemplates(data);

          // Auto-select: if only one template in a category, select it
          const titleList = data.filter((t) => t.category === "title");
          const descriptionList = data.filter((t) => t.category === "description");

          if (titleList.length === 1 && !titleTemplateId) {
            setTitleTemplateId(titleList[0]!.id);
          }
          if (descriptionList.length === 1 && !descriptionTemplateId) {
            setDescriptionTemplateId(descriptionList[0]!.id);
          }
        }
      } catch {
        // Templates are optional — modal still works without them
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const titleTemplates = useMemo(() => templates.filter((t) => t.category === "title"), [templates]);
  const descriptionTemplates = useMemo(() => templates.filter((t) => t.category === "description"), [templates]);

  const selectedTitleTemplate = useMemo(() => titleTemplates.find((t) => t.id === titleTemplateId), [titleTemplates, titleTemplateId]);
  const selectedDescriptionTemplate = useMemo(
    () => descriptionTemplates.find((t) => t.id === descriptionTemplateId),
    [descriptionTemplates, descriptionTemplateId],
  );

  const draftManifest = useMemo((): Partial<SessionManifest> => {
    const draft: Partial<SessionManifest> = {};
    if (speaker) draft.speaker = speaker;
    if (title) draft.title = title;
    if (bookId && chapter && verse) {
      const reference: ScriptureReference = { bookId, chapter, verse };
      if (verseEnd) reference.verseEnd = verseEnd;
      draft.scripture = reference;
    }
    return draft;
  }, [speaker, title, bookId, chapter, verse, verseEnd]);

  const titlePreview = useMemo(() => interpolateTemplate(draftManifest, selectedTitleTemplate?.formatString), [draftManifest, selectedTitleTemplate]);

  const descriptionPreview = useMemo(
    () => (selectedDescriptionTemplate ? interpolateTemplate(draftManifest, selectedDescriptionTemplate.formatString) : ""),
    [draftManifest, selectedDescriptionTemplate],
  );

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

  const buildManifest = (): Partial<SessionManifest> & { titleTemplateId?: string; descriptionTemplateId?: string } => {
    const patch: Partial<SessionManifest> & { titleTemplateId?: string; descriptionTemplateId?: string } = {};
    if (speaker) patch.speaker = speaker;
    if (title) patch.title = title;
    if (bookId && chapter && verse) {
      const reference: ScriptureReference = { bookId, chapter, verse };
      if (verseEnd) reference.verseEnd = verseEnd;
      patch.scripture = reference;
    }
    if (titleTemplateId) patch.titleTemplateId = titleTemplateId;
    if (descriptionTemplateId) patch.descriptionTemplateId = descriptionTemplateId;
    return patch;
  };

  const handleSave = (): void => {
    if (!socket) return;
    setSaving(true);
    setError("");
    const timeout = setTimeout(() => {
      setSaving(false);
      setError("Save failed \u2014 check your connection and try again.");
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
    // Template selections are preserved on clear per design
  };

  const isLive = obsState.streaming || obsState.recording;

  const footer = (
    <div className="manifest-footer">
      <button
        data-testid={TEST_ID_MANIFEST_CLEAR}
        onClick={handleClear}
        disabled={saving || isLive}
        className={`button-ghost-danger button-padding-compact ${saving || isLive ? "opacity-disabled" : ""}`}
      >
        Clear All
      </button>
      <span className="fill-remaining" />
      <button data-testid={TEST_ID_MANIFEST_CANCEL} onClick={onClose} disabled={saving} className="button-outline button-padding-standard">
        Cancel
      </button>
      <button
        data-testid={TEST_ID_MANIFEST_SAVE}
        onClick={handleSave}
        disabled={saving}
        className={`button-primary text-bold button-padding-standard ${saving ? "opacity-disabled" : ""}`}
      >
        {saving ? "Saving\u2026" : "Save"}
      </button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="small" header="Session Details" footer={footer}>
      <div data-testid={TEST_ID_SESSION_MANIFEST_MODAL} className="manifest-form">
        {titleTemplates.length > 0 && (
          <div className="manifest-field">
            <label className="text-muted text-caption" htmlFor="title-template-select">
              Title Format
            </label>
            <select
              id="title-template-select"
              data-testid={TEST_ID_MANIFEST_TITLE_TEMPLATE}
              value={titleTemplateId}
              onChange={(event) => setTitleTemplateId(event.target.value)}
              className="manifest-select"
            >
              <option value="">{"\u2014 Select \u2014"}</option>
              {titleTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {descriptionTemplates.length > 0 && (
          <div className="manifest-field">
            <label className="text-muted text-caption" htmlFor="description-template-select">
              Description Format
            </label>
            <select
              id="description-template-select"
              data-testid={TEST_ID_MANIFEST_DESCRIPTION_TEMPLATE}
              value={descriptionTemplateId}
              onChange={(event) => setDescriptionTemplateId(event.target.value)}
              className="manifest-select"
            >
              <option value="">{"\u2014 Select \u2014"}</option>
              {descriptionTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <IonInput
          data-testid={TEST_ID_MANIFEST_SPEAKER}
          label="Speaker"
          labelPlacement="stacked"
          fill="outline"
          value={speaker}
          onIonInput={(event) => setSpeaker(event.detail.value ?? "")}
          clearInput
        />
        <IonInput
          data-testid={TEST_ID_MANIFEST_TITLE}
          label="Sermon Title"
          labelPlacement="stacked"
          fill="outline"
          value={title}
          onIonInput={(event) => setTitle(event.detail.value ?? "")}
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

        <div data-testid={TEST_ID_MANIFEST_PREVIEW} className="manifest-preview">
          <span className="text-muted">Stream title preview</span>
          <p className="text-bold margin-top-tight margin-none">{titlePreview}</p>
        </div>

        {descriptionPreview && (
          <div data-testid={TEST_ID_MANIFEST_DESCRIPTION_PREVIEW} className="manifest-preview">
            <span className="text-muted">Description preview</span>
            <p className="text-bold margin-top-tight margin-none">{descriptionPreview}</p>
          </div>
        )}

        {error && (
          <IonText color="danger" data-testid={TEST_ID_MANIFEST_SAVE_ERROR}>
            <p className="margin-none text-secondary">{error}</p>
          </IonText>
        )}
      </div>
    </Modal>
  );
}
