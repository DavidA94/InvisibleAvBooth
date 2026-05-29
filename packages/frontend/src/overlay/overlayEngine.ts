/**
 * Imperative overlay engine — no React state, no effects, no re-renders.
 * Owns all DOM manipulation, socket connection, measurement, and animations.
 */
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import type { LowerThirdItem, LowerThirdState, AnimationPhase, PageBreakdown, VerseData } from "@invisible-av-booth/shared";
import {
  STO_LOWER_THIRD_SHOW, STO_LOWER_THIRD_DISMISS, STO_LOWER_THIRD_PUSH_UP,
  STO_LOWER_THIRD_PAGE, STO_LOWER_THIRD_STATE, STO_LOWER_THIRD_MEASURE,
  STO_LOWER_THIRD_FORCE_CLEAR, OTS_LOWER_THIRD_PHASE, OTS_LOWER_THIRD_RESOLUTION, OTS_LOWER_THIRD_PAGES,
} from "@invisible-av-booth/shared";
import { measureScripture } from "./measureScripture";

const DISCONNECT_TIMEOUT_MS = 15000;
const HEARTBEAT_INTERVAL_MS = 5000;
const PUSH_HEIGHT_SPEED = 120;
const PUSH_TEXT_SPEED = 240;

let socket: Socket | null = null;
let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let measureAbort: AbortController | null = null;
let currentItem: LowerThirdItem | null = null;
let currentPhase: AnimationPhase = "hidden";

// DOM references
let wrapper: HTMLDivElement | null = null;
let jail: HTMLElement | null = null;

export function initOverlay(root: HTMLElement): void {
  document.documentElement.classList.add("overlay-active");
  jail = root.querySelector(".aspect-ratio-jail");

  // Build the wrapper structure
  wrapper = document.createElement("div");
  wrapper.className = "br-wrapper br-phase--hidden";
  wrapper.innerHTML = `
    <div class="br-rhombus-wrapper">
      <div class="br-rhombus"></div>
    </div>
    <div class="br-plate">
      <div class="br-content-track">
        <div class="br-content"></div>
      </div>
    </div>
  `;
  root.querySelector(".lower-third-container")!.appendChild(wrapper);

  // Listen for animation end
  wrapper.addEventListener("animationend", handleAnimationEnd);

  document.fonts.ready.then(() => {
    connectSocket();
  });
}

export function destroyOverlay(): void {
  document.documentElement.classList.remove("overlay-active");
  if (socket) { socket.disconnect(); socket = null; }
  if (disconnectTimer) { clearTimeout(disconnectTimer); disconnectTimer = null; }
  if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
  measureAbort?.abort();
}

// ── Socket ──────────────────────────────────────────────────────────────────

function connectSocket(): void {
  if (socket) return;
  socket = io("/overlay", { transports: ["websocket"], reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 8000 });

  socket.on("connect", () => {
    if (disconnectTimer) { clearTimeout(disconnectTimer); disconnectTimer = null; }
    const width = window.innerWidth;
    const height = window.innerHeight;
    socket!.emit(OTS_LOWER_THIRD_RESOLUTION, { width, height, isCorrect: width === 1920 && height === 1080 });
    window.parent.postMessage({ type: "overlay-ready" }, "*");
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => window.parent.postMessage({ type: "overlay-heartbeat" }, "*"), HEARTBEAT_INTERVAL_MS);
    sendLog("info", "Overlay connected");
  });

  socket.on("disconnect", () => {
    startDisconnectTimer();
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
    sendLog("warn", "Overlay disconnected");
  });

  socket.on(STO_LOWER_THIRD_STATE, (state: LowerThirdState & { skipEntrance?: boolean }) => {
    if (state.phase === "dismissing" || state.phase === "hidden") {
      hide(); reportPhase("hidden");
    } else if (state.active && state.skipEntrance) {
      showImmediate(state.active);
      reportPhase("visible");
    } else if (state.active && state.phase === "showing") {
      show(state.active);
    }
  });

  socket.on(STO_LOWER_THIRD_SHOW, (data: { item: LowerThirdItem }) => {
    measureAbort?.abort();
    show(data.item);
  });

  socket.on(STO_LOWER_THIRD_DISMISS, () => { dismiss(); });

  socket.on(STO_LOWER_THIRD_PUSH_UP, (data: { item: LowerThirdItem }) => {
    measureAbort?.abort();
    pushUp(data.item);
  });

  socket.on(STO_LOWER_THIRD_PAGE, (data: { page: number }) => {
    if (currentItem?.pages) {
      currentItem = { ...currentItem, pages: { ...currentItem.pages, currentPage: data.page } };
      pushUp(currentItem);
    }
  });

  socket.on(STO_LOWER_THIRD_FORCE_CLEAR, () => {
    hide();
    reportPhase("hidden");
  });

  socket.on(STO_LOWER_THIRD_MEASURE, (data: { itemId: string; verses: VerseData[]; reference: string }) => {
    measureAbort?.abort();
    const abort = new AbortController();
    measureAbort = abort;
    measureScripture(data.verses, abort.signal)
      .then((pages) => { if (!abort.signal.aborted) socket!.emit(OTS_LOWER_THIRD_PAGES, { itemId: data.itemId, pages }); })
      .catch(() => {
        if (!abort.signal.aborted) {
          const fallback: PageBreakdown = { totalPages: 1, currentPage: 1, pages: [{ pageNumber: 1, startVerse: data.verses[0]?.verseNumber ?? 1, endVerse: data.verses[data.verses.length - 1]?.verseNumber ?? 1 }] };
          socket!.emit(OTS_LOWER_THIRD_PAGES, { itemId: data.itemId, pages: fallback });
        }
      });
  });
}

// ── Animations ──────────────────────────────────────────────────────────────

function show(item: LowerThirdItem): void {
  currentItem = item;
  currentPhase = "showing";
  const height = measureItemHeight(item);
  setWrapperVars(height);
  setContent(getContentElement(), item);
  wrapper!.style.height = `${height}px`;
  wrapper!.className = "br-wrapper br-phase--showing";
  reportPhase("showing");
}

function showImmediate(item: LowerThirdItem): void {
  currentItem = item;
  currentPhase = "visible";
  const height = measureItemHeight(item);
  setWrapperVars(height);
  setContent(getContentElement(), item);
  wrapper!.style.height = `${height}px`;
  wrapper!.className = "br-wrapper br-phase--visible";
}

function dismiss(): void {
  currentPhase = "dismissing";
  wrapper!.className = "br-wrapper br-phase--dismissing";
  reportPhase("dismissing");
}

function hide(): void {
  currentItem = null;
  currentPhase = "hidden";
  wrapper!.className = "br-wrapper br-phase--hidden";
}

function pushUp(newItem: LowerThirdItem): void {
  const track = wrapper!.querySelector(".br-content-track") as HTMLElement;
  const oldContent = track.querySelector(".br-content") as HTMLElement;
  const oldHeight = wrapper!.getBoundingClientRect().height;
  const newHeight = measureItemHeight(newItem);
  const delta = Math.abs(newHeight - oldHeight);

  // Add spacer after old content
  const spacer = document.createElement("div");
  spacer.className = "br-push-spacer";
  track.appendChild(spacer);

  // Measure distance to move (old content + spacer)
  const distanceToMove = oldContent.getBoundingClientRect().height + spacer.getBoundingClientRect().height;

  // Add new content
  const newContentEl = document.createElement("div");
  newContentEl.className = "br-content";
  setContent(newContentEl, newItem);
  track.appendChild(newContentEl);

  // Calculate durations
  const heightDuration = delta > 0 ? delta / PUSH_HEIGHT_SPEED : 0;
  const transformDuration = heightDuration > 0 ? heightDuration : distanceToMove / PUSH_TEXT_SPEED;

  // Set CSS vars for transition
  wrapper!.style.setProperty("--push-height-duration", `${heightDuration}s`);
  wrapper!.style.setProperty("--push-transform-duration", `${transformDuration}s`);
  wrapper!.style.setProperty("--new-wrapper-height", `${newHeight}px`);
  setWrapperVars(newHeight);

  // Apply push class and trigger transitions
  wrapper!.className = "br-wrapper br-phase--pushing";
  wrapper!.style.height = `${newHeight}px`;
  track.style.transition = `transform ${transformDuration}s var(--lt-easing-push, linear)`;
  track.style.transform = `translateY(-${distanceToMove}px)`;

  // Cleanup after transition
  const cleanup = (): void => {
    track.removeEventListener("transitionend", cleanup);
    oldContent.remove();
    spacer.remove();
    track.style.transition = "";
    track.style.transform = "";
    wrapper!.className = "br-wrapper br-phase--visible";
    currentItem = newItem;
    currentPhase = "visible";
    reportPhase("visible");
  };
  track.addEventListener("transitionend", cleanup, { once: true });

  currentPhase = "showing";
  reportPhase("showing");
}

// ── DOM Helpers ─────────────────────────────────────────────────────────────

function getContentElement(): HTMLElement {
  return wrapper!.querySelector(".br-content") as HTMLElement;
}

function setContent(element: HTMLElement, item: LowerThirdItem): void {
  element.innerHTML = buildContentHtml(item);
}

function buildContentHtml(item: LowerThirdItem): string {
  switch (item.type) {
    case "Title": {
      const content = item.content as { title: string };
      return `<p class="br-text br-text--title">${escapeHtml(content.title)}</p>`;
    }
    case "TitleSubtitle": {
      const content = item.content as { title: string; subtitle: string };
      return `<p class="br-text br-text--title">${escapeHtml(content.title)}</p><p class="br-text br-text--subtitle">${escapeHtml(content.subtitle)}</p>`;
    }
    case "Scripture": {
      const content = item.content as { formattedReference: string; verses: VerseData[] };
      const currentPage = item.pages?.currentPage ?? 1;
      const pageInfo = item.pages?.pages[currentPage - 1];
      const verses = pageInfo
        ? content.verses.filter((verse) => verse.verseNumber >= pageInfo.startVerse && verse.verseNumber <= pageInfo.endVerse)
        : content.verses;
      let html = `<p class="br-text br-text--reference">${escapeHtml(content.formattedReference)}</p><div class="br-verses">`;
      for (const verse of verses) {
        const cls = verse.verseNumber === 0 ? "br-verse br-verse--zero" : "br-verse";
        const prefix = verse.verseNumber > 0 ? `<span class="br-verse-num">${verse.verseNumber}. </span>` : "";
        html += `<p class="${cls}">${prefix}${escapeHtml(verse.text)}</p>`;
      }
      html += "</div>";
      return html;
    }
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function measureItemHeight(item: LowerThirdItem): number {
  const measurePlate = document.createElement("div");
  measurePlate.className = "br-plate";
  measurePlate.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;top:-9999px;left:0;";
  const measureContent = document.createElement("div");
  measureContent.className = "br-content";
  setContent(measureContent, item);
  measurePlate.appendChild(measureContent);

  // Must be inside a wrapper with the same width for accurate measurement
  const measureWrapper = document.createElement("div");
  measureWrapper.className = "br-wrapper br-phase--visible";
  measureWrapper.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;top:-9999px;left:0;";
  measureWrapper.appendChild(measurePlate);
  jail!.appendChild(measureWrapper);

  const height = measurePlate.getBoundingClientRect().height;
  measureWrapper.remove();
  return height;
}

function setWrapperVars(height: number): void {
  if (!jail) return;
  const jailWidth = jail.getBoundingClientRect().width;
  const rhombusBaseWidth = Math.max(0.005 * jailWidth, 4);
  const slantShift = rhombusBaseWidth * 0.60;
  wrapper!.style.setProperty("--wrapper-height", `${height}px`);
  wrapper!.style.setProperty("--slant-shift", `${slantShift}px`);
  wrapper!.style.setProperty("--rhombus-base-width", `${rhombusBaseWidth}px`);
}

// ── Event Handling ──────────────────────────────────────────────────────────

function handleAnimationEnd(event: AnimationEvent): void {
  const name = event.animationName;
  if (currentPhase === "showing" && name === "br-plate-unfold") {
    currentPhase = "visible";
    wrapper!.className = "br-wrapper br-phase--visible";
    reportPhase("visible");
  } else if (currentPhase === "dismissing" && name === "br-rhombus-shrink") {
    hide();
    reportPhase("hidden");
  }
}

function reportPhase(phase: AnimationPhase): void {
  socket?.emit(OTS_LOWER_THIRD_PHASE, phase);
}

function startDisconnectTimer(): void {
  if (disconnectTimer) clearTimeout(disconnectTimer);
  disconnectTimer = setTimeout(() => {
    if (currentItem && !currentItem.autoDismissMs) {
      dismiss();
      setTimeout(() => { hide(); }, 2000);
    }
  }, DISCONNECT_TIMEOUT_MS);
}

function sendLog(level: string, message: string): void {
  fetch("/api/overlay/logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ level, message }]),
  }).catch(() => {});
}
