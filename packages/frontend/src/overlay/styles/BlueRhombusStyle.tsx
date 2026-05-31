import { useRef, useEffect, useCallback, useState } from "react";
import type { ReactNode, AnimationEvent as ReactAnimationEvent, CSSProperties } from "react";
import { TEST_ID_BLUE_RHOMBUS } from "../../constants/testIds";
import type { LowerThirdItem, TitleContent, TitleSubtitleContent, ScriptureContent, AnimationPhase } from "@invisible-av-booth/shared";
import "./BlueRhombusStyle.css";

interface BlueRhombusStyleProps {
  item: LowerThirdItem;
  prevItem?: LowerThirdItem | null;
  phase: AnimationPhase;
  isPushUp?: boolean;
  onAnimationEnd: () => void;
}

/* ── Content Rendering ───────────────────────────────────────────────────── */

function ContentBlock({ item }: { item: LowerThirdItem }): ReactNode {
  switch (item.type) {
    case "Title": {
      const content = item.content as TitleContent;
      return <p className="br-text br-text--title">{content.title}</p>;
    }
    case "TitleSubtitle": {
      const content = item.content as TitleSubtitleContent;
      return (
        <>
          <p className="br-text br-text--title">{content.title}</p>
          <p className="br-text br-text--subtitle">{content.subtitle}</p>
        </>
      );
    }
    case "Scripture": {
      const content = item.content as ScriptureContent;
      const currentPage = item.pages?.currentPage ?? 1;
      const pageInfo = item.pages?.pages[currentPage - 1];
      const verses = pageInfo
        ? content.verses.filter((verse) => verse.verseNumber >= pageInfo.startVerse && verse.verseNumber <= pageInfo.endVerse)
        : content.verses;
      return (
        <>
          <p className="br-text br-text--reference">{content.formattedReference}</p>
          <div className="br-verses">
            {verses.map((verse) => (
              <p key={verse.verseNumber} className={`br-verse ${verse.verseNumber === 0 ? "br-verse--zero" : ""}`}>
                {verse.verseNumber > 0 && <span className="br-verse-num">{verse.verseNumber}. </span>}
                {verse.text}
              </p>
            ))}
          </div>
        </>
      );
    }
  }
}

/* ── Height Measurement ──────────────────────────────────────────────────── */

function useMeasureHeight(): (item: LowerThirdItem) => number {
  const measureRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Create a hidden measurement container inside the jail
    const jail = document.querySelector(".aspect-ratio-jail");
    if (!jail) return;
    const container = document.createElement("div");
    container.className = "br-wrapper br-phase--visible";
    container.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;top:-9999px;left:0;";
    container.innerHTML = '<div class="br-plate"><div class="br-content" data-measure="true"></div></div>';
    jail.appendChild(container);
    measureRef.current = container.querySelector("[data-measure]");
    return () => {
      container.remove();
    };
  }, []);

  return useCallback((item: LowerThirdItem): number => {
    const container = measureRef.current;
    if (!container) return 0;
    // Temporarily render content to measure
    const tempDiv = document.createElement("div");
    // We need to render the content — use a simple approach matching ContentBlock output
    tempDiv.innerHTML = buildContentHtml(item);
    container.appendChild(tempDiv);
    const height = container.parentElement!.getBoundingClientRect().height;
    tempDiv.remove();
    return height;
  }, []);
}

function buildContentHtml(item: LowerThirdItem): string {
  switch (item.type) {
    case "Title": {
      const content = item.content as TitleContent;
      return `<p class="br-text br-text--title">${escapeHtml(content.title)}</p>`;
    }
    case "TitleSubtitle": {
      const content = item.content as TitleSubtitleContent;
      return `<p class="br-text br-text--title">${escapeHtml(content.title)}</p><p class="br-text br-text--subtitle">${escapeHtml(content.subtitle)}</p>`;
    }
    case "Scripture": {
      const content = item.content as ScriptureContent;
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

/* ── Constants ───────────────────────────────────────────────────────────── */

const PUSH_HEIGHT_SPEED = 120; // px per second for height changes
const PUSH_TEXT_SPEED = 240; // px per second for text movement when no height change

/* ── Component ───────────────────────────────────────────────────────────── */

export function BlueRhombusStyle({ item, prevItem, phase, isPushUp, onAnimationEnd }: BlueRhombusStyleProps): ReactNode {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [wrapperHeight, setWrapperHeight] = useState<number | null>(null);
  const [pushState, setPushState] = useState<{
    oldItem: LowerThirdItem;
    trackTranslateY: number;
    heightDuration: number;
    transformDuration: number;
    newHeight: number;
  } | null>(null);

  const measureHeight = useMeasureHeight();

  // Measure height on item change (for show and skipEntrance/reload)
  const lastMeasuredItemId = useRef<string | null>(null);
  useEffect(() => {
    if (!item) return;
    if (phase === "showing" && isPushUp) return; // push-up handles its own measurement
    if (lastMeasuredItemId.current === item.id && wrapperHeight !== null) return; // same item, already measured
    const height = measureHeight(item);
    if (height > 0) {
      setWrapperHeight(height);
      lastMeasuredItemId.current = item.id;
    }
  }, [item, phase, isPushUp, measureHeight, wrapperHeight]);

  // Start push-up animation
  useEffect(() => {
    if (!isPushUp || !prevItem || phase !== "showing") return;

    const oldHeight = measureHeight(prevItem);
    const newHeight = measureHeight(item);
    const delta = Math.abs(newHeight - oldHeight);

    // Calculate durations
    const heightDuration = delta > 0 ? delta / PUSH_HEIGHT_SPEED : 0;
    const transformDuration = heightDuration > 0 ? heightDuration : oldHeight / PUSH_TEXT_SPEED;

    // The track needs to move up by: old content height + spacer
    const spacerHeight = 20; // approximate 1lh in pixels
    const trackTranslateY = oldHeight + spacerHeight;

    setPushState({ oldItem: prevItem, trackTranslateY, heightDuration, transformDuration, newHeight });
    setWrapperHeight(newHeight);
    lastMeasuredItemId.current = item.id;
  }, [isPushUp, prevItem, item, phase, measureHeight]);

  // Handle animation/transition end
  const handleTransitionEnd = useCallback(() => {
    if (pushState) {
      setPushState(null);
      onAnimationEnd();
    }
  }, [pushState, onAnimationEnd]);

  const handleAnimationEnd = useCallback(
    (event: ReactAnimationEvent) => {
      const animationName = event.animationName;
      // Show complete: plate unfold is the last animation to finish
      if (phase === "showing" && !isPushUp && animationName === "br-plate-unfold") {
        onAnimationEnd();
      }
      // Dismiss complete: rhombus shrink is the last animation (delayed after slide)
      if (phase === "dismissing" && animationName === "br-rhombus-shrink") {
        onAnimationEnd();
      }
    },
    [phase, isPushUp, onAnimationEnd],
  );

  // Determine phase class
  const phaseClass = isPushUp && pushState ? "br-phase--pushing" : `br-phase--${phase}`;

  // Dynamic CSS variables (documented exception: runtime-computed animation parameters)
  const wrapperStyle: Record<string, string> = {};
  if (wrapperHeight !== null) {
    wrapperStyle["--wrapper-height"] = `${wrapperHeight}px`;
    // Calculate slant-shift in JS because cqw units don't resolve inside atan2() in CEF/OBS
    const jailWidth = document.querySelector(".aspect-ratio-jail")?.getBoundingClientRect().width ?? 1920;
    const rhombusBaseWidth = Math.max(0.005 * jailWidth, 4); // max(0.5cqw, 4px)
    const slantShift = rhombusBaseWidth * 0.6;
    wrapperStyle["--slant-shift"] = `${slantShift}px`;
    wrapperStyle["--rhombus-base-width"] = `${rhombusBaseWidth}px`;
  }
  if (pushState) {
    wrapperStyle["--new-wrapper-height"] = `${pushState.newHeight}px`;
    wrapperStyle["--push-height-duration"] = `${pushState.heightDuration}s`;
    wrapperStyle["--push-transform-duration"] = `${pushState.transformDuration}s`;
    wrapperStyle["height"] = `${pushState.newHeight}px`;
  } else if (wrapperHeight !== null) {
    wrapperStyle["height"] = `${wrapperHeight}px`;
  }

  const trackStyle: Record<string, string> = {};
  if (pushState) {
    trackStyle["transform"] = `translateY(-${pushState.trackTranslateY}px)`;
  }

  return (
    <div
      ref={wrapperRef}
      className={`br-wrapper ${phaseClass}`}
      style={wrapperStyle as CSSProperties}
      onAnimationEnd={handleAnimationEnd}
      data-testid={TEST_ID_BLUE_RHOMBUS}
    >
      <div className="br-rhombus-wrapper">
        <div className="br-rhombus" />
      </div>
      <div className="br-plate">
        <div ref={trackRef} className="br-content-track" style={trackStyle as CSSProperties} onTransitionEnd={handleTransitionEnd}>
          {pushState && (
            <>
              <div className="br-content">
                <ContentBlock item={pushState.oldItem} />
              </div>
              <div className="br-push-spacer" />
            </>
          )}
          <div className="br-content">
            <ContentBlock item={item} />
          </div>
        </div>
      </div>
    </div>
  );
}
