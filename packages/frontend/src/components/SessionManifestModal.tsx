import { useState, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { IonInput, IonText, IonPopover } from "@ionic/react";
import Select from "react-select";
import { CTS_SESSION_MANIFEST_UPDATE, interpolateTemplate } from "@invisible-av-booth/shared";
import { darkSelectStyles } from "../theme/selectStyles";
import { useStore } from "../store";
import { useSocket } from "../providers/SocketProvider";
import { Modal } from "./Modal";
import { ScriptureReferenceInput } from "./scripture/ScriptureReferenceInput";
import { buildDraftManifest, computeRequiredTokens, hasDescriptionContent, type Template } from "./sessionManifestLogic";
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
import type { SessionManifest, CommandResult } from "../types";

const ACK_TIMEOUT = 5000;

type TemplateOption = { value: string; label: string };

interface SessionManifestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LS_TITLE_TEMPLATE_KEY = "manifest_titleTemplateId";
const LS_DESC_TEMPLATE_KEY = "manifest_descriptionTemplateId";

export function SessionManifestModal({ isOpen, onClose }: SessionManifestModalProps): ReactNode {
  const storeManifest = useStore((s) => s.manifest);
  const obsState = useStore((s) => s.obsState);
  const storeDescription = useStore((s) => s.interpolatedDescription);
  const socket = useSocket();

  const [speaker, setSpeaker] = useState("");
  const [title, setTitle] = useState("");
  const [bookId, setBookId] = useState<number | null>(null);
  const [chapter, setChapter] = useState<number | null>(null);
  const [verse, setVerse] = useState<number | null>(null);
  const [verseEnd, setVerseEnd] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [descPopoverOpen, setDescPopoverOpen] = useState(false);
  const [descPopoverEvent, setDescPopoverEvent] = useState<Event | undefined>(undefined);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [titleTemplateId, setTitleTemplateId] = useState<string>(() => localStorage.getItem(LS_TITLE_TEMPLATE_KEY) ?? "");
  const [descriptionTemplateId, setDescriptionTemplateId] = useState<string>(() => localStorage.getItem(LS_DESC_TEMPLATE_KEY) ?? "");

  const handleTitleTemplateChange = (id: string): void => {
    setTitleTemplateId(id);
    if (id) localStorage.setItem(LS_TITLE_TEMPLATE_KEY, id);
    else localStorage.removeItem(LS_TITLE_TEMPLATE_KEY);
  };

  const handleDescriptionTemplateChange = (id: string): void => {
    setDescriptionTemplateId(id);
    if (id) localStorage.setItem(LS_DESC_TEMPLATE_KEY, id);
    else localStorage.removeItem(LS_DESC_TEMPLATE_KEY);
  };

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/templates", { credentials: "include" });
        if (response.ok && !cancelled) {
          const data = (await response.json()) as Template[];
          setTemplates(data);
          const titleList = data.filter((t) => t.category === "title");
          const descList = data.filter((t) => t.category === "description");
          if (titleList.length === 1 && !titleTemplateId) setTitleTemplateId(titleList[0]!.id);
          if (descList.length === 1 && !descriptionTemplateId) setDescriptionTemplateId(descList[0]!.id);
        }
      } catch {
        /* templates optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const titleTemplates = useMemo(() => templates.filter((t) => t.category === "title"), [templates]);
  const descriptionTemplates = useMemo(() => templates.filter((t) => t.category === "description"), [templates]);

  const titleOptions: TemplateOption[] = useMemo(() => titleTemplates.map((t) => ({ value: t.id, label: t.name })), [titleTemplates]);
  const descOptions: TemplateOption[] = useMemo(() => descriptionTemplates.map((t) => ({ value: t.id, label: t.name })), [descriptionTemplates]);

  const selectedTitleTemplate = useMemo(() => titleTemplates.find((t) => t.id === titleTemplateId), [titleTemplates, titleTemplateId]);
  const selectedDescTemplate = useMemo(() => descriptionTemplates.find((t) => t.id === descriptionTemplateId), [descriptionTemplates, descriptionTemplateId]);

  // Determine which fields are needed by the selected templates
  const requiredTokens = useMemo(() => computeRequiredTokens(selectedTitleTemplate, selectedDescTemplate), [selectedTitleTemplate, selectedDescTemplate]);

  const needsSpeaker = requiredTokens.has("Speaker");
  const needsTitle = requiredTokens.has("Title");
  const needsScripture = requiredTokens.has("Scripture") || requiredTokens.has("verseText");
  const hasAnyTemplate = !!titleTemplateId;

  const draftManifest = useMemo(
    (): Partial<SessionManifest> => buildDraftManifest({ speaker, title, bookId, chapter, verse, verseEnd }),
    [speaker, title, bookId, chapter, verse, verseEnd],
  );

  const titlePreview = useMemo(() => interpolateTemplate(draftManifest, selectedTitleTemplate?.formatString), [draftManifest, selectedTitleTemplate]);

  const descHasContent = hasDescriptionContent(selectedDescTemplate);
  const descriptionPreview = useMemo(
    () => (descHasContent ? interpolateTemplate(draftManifest, selectedDescTemplate!.formatString) : ""),
    [draftManifest, descHasContent, selectedDescTemplate],
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

  const handleSave = (): void => {
    if (!socket) return;
    setSaving(true);
    setError("");
    const patch: Partial<SessionManifest> = { ...draftManifest };
    if (titleTemplateId) patch.titleTemplateId = titleTemplateId;
    if (descriptionTemplateId) patch.descriptionTemplateId = descriptionTemplateId;
    const timeout = setTimeout(() => {
      setSaving(false);
      setError("Save failed — check your connection and try again.");
    }, ACK_TIMEOUT);
    socket.emit(CTS_SESSION_MANIFEST_UPDATE, patch, (result: CommandResult) => {
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
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="small" header="Session Details" footer={footer}>
      <div data-testid={TEST_ID_SESSION_MANIFEST_MODAL} className="manifest-form">
        {/* Template dropdowns — side by side */}
        {(titleTemplates.length > 0 || descriptionTemplates.length > 0) && (
          <div className="manifest-template-row">
            {titleTemplates.length > 0 && (
              <div className="manifest-template-col" data-testid={TEST_ID_MANIFEST_TITLE_TEMPLATE}>
                <label className="text-muted text-caption">Title Format</label>
                <Select<TemplateOption>
                  options={titleOptions}
                  value={titleOptions.find((o) => o.value === titleTemplateId) ?? null}
                  onChange={(opt) => handleTitleTemplateChange(opt?.value ?? "")}
                  placeholder="— Select —"
                  styles={darkSelectStyles<TemplateOption>()}
                  isClearable
                />
              </div>
            )}
            {descriptionTemplates.length > 0 && (
              <div className="manifest-template-col" data-testid={TEST_ID_MANIFEST_DESCRIPTION_TEMPLATE}>
                <label className="text-muted text-caption">Description Format</label>
                <Select<TemplateOption>
                  options={descOptions}
                  value={descOptions.find((o) => o.value === descriptionTemplateId) ?? null}
                  onChange={(opt) => handleDescriptionTemplateChange(opt?.value ?? "")}
                  placeholder="— Select —"
                  styles={darkSelectStyles<TemplateOption>()}
                  isClearable
                />
              </div>
            )}
          </div>
        )}

        {/* Only show fields required by selected templates */}
        {hasAnyTemplate && (
          <>
            {needsSpeaker && (
              <IonInput
                data-testid={TEST_ID_MANIFEST_SPEAKER}
                label="Speaker"
                labelPlacement="stacked"
                fill="outline"
                value={speaker}
                onIonInput={(e) => setSpeaker(e.detail.value ?? "")}
                clearInput
              />
            )}
            {needsTitle && (
              <IonInput
                data-testid={TEST_ID_MANIFEST_TITLE}
                label="Sermon Title"
                labelPlacement="stacked"
                fill="outline"
                value={title}
                onIonInput={(e) => setTitle(e.detail.value ?? "")}
                clearInput
              />
            )}
            {needsScripture && (
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
          </>
        )}

        {!hasAnyTemplate && templates.length > 0 && (
          <p className="text-muted" style={{ fontStyle: "italic", textAlign: "center", padding: "0.5rem 0" }}>
            Select a title format to enter session details.
          </p>
        )}

        {/* Title preview */}
        {hasAnyTemplate && (
          <div data-testid={TEST_ID_MANIFEST_PREVIEW} className="manifest-preview">
            <span className="text-muted">Stream title preview</span>
            <p className="text-bold margin-top-tight margin-none">{titlePreview}</p>
          </div>
        )}

        {/* Description preview */}
        {hasAnyTemplate && (
          <div data-testid={TEST_ID_MANIFEST_DESCRIPTION_PREVIEW} className="manifest-preview">
            <span className="text-muted">Description preview</span>
            {descHasContent ? (
              <>
                <div
                  className="margin-top-tight"
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    setDescPopoverEvent(e.nativeEvent);
                    setDescPopoverOpen(true);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && setDescPopoverOpen(true)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="text-bold text-ellipsis">{descriptionPreview.split("\n")[0]}</div>
                  {descriptionPreview.includes("\n") && (
                    <div className="text-muted text-italic" style={{ fontSize: "0.8rem" }}>
                      Tap for full preview
                    </div>
                  )}
                </div>
                <IonPopover isOpen={descPopoverOpen} onDidDismiss={() => setDescPopoverOpen(false)} event={descPopoverEvent} className="popover-description">
                  <div className="padding-standard" style={{ whiteSpace: "pre-wrap" }}>
                    {storeDescription || descriptionPreview}
                  </div>
                </IonPopover>
              </>
            ) : (
              <p className="margin-top-tight margin-none" style={{ fontStyle: "italic", color: "var(--color-text-muted)" }}>
                No description template selected
              </p>
            )}
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
