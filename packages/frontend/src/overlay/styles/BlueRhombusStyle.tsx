import type { ReactNode } from "react";
import type { LowerThirdItem, TitleContent, TitleSubtitleContent, ScriptureContent, AnimationPhase } from "@invisible-av-booth/shared";
import "./BlueRhombusStyle.css";

interface BlueRhombusStyleProps {
  item: LowerThirdItem;
  prevItem?: LowerThirdItem | null;
  phase: AnimationPhase;
  isPushUp?: boolean;
  onAnimationEnd: () => void;
}

function getVerses(item: LowerThirdItem): ReactNode {
  const content = item.content as ScriptureContent;
  const currentPage = item.pages?.currentPage ?? 1;
  const pageInfo = item.pages?.pages[currentPage - 1];
  const verses = pageInfo
    ? content.verses.filter((verse) => verse.verseNumber >= pageInfo.startVerse && verse.verseNumber <= pageInfo.endVerse)
    : content.verses;
  return (
    <div className="br-verses">
      {verses.map((verse) => (
        <p key={verse.verseNumber} className={`br-verse ${verse.verseNumber === 0 ? "br-verse--zero" : ""}`}>
          {verse.verseNumber > 0 && <span className="br-verse-num">{verse.verseNumber}. </span>}
          {verse.text}
        </p>
      ))}
    </div>
  );
}

function renderContent(item: LowerThirdItem): ReactNode {
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
      return (
        <>
          <p className="br-text br-text--reference">{content.formattedReference}</p>
          {getVerses(item)}
        </>
      );
    }
  }
}

/** Returns true when both items are Scripture with the same reference — a page turn, not a content swap. */
function isPageTurn(item: LowerThirdItem, prevItem: LowerThirdItem | null | undefined): boolean {
  if (!prevItem || item.type !== "Scripture" || prevItem.type !== "Scripture") return false;
  const a = item.content as ScriptureContent;
  const b = prevItem.content as ScriptureContent;
  return a.reference.bookId === b.reference.bookId && a.reference.chapter === b.reference.chapter;
}

export function BlueRhombusStyle({ item, prevItem, phase, isPushUp, onAnimationEnd }: BlueRhombusStyleProps): ReactNode {
  const pageTurn = isPushUp && isPageTurn(item, prevItem);

  return (
    <div className={`br-wrapper br-phase--${phase} ${isPushUp ? "br-push-up" : ""}`} onAnimationEnd={onAnimationEnd} data-testid="blue-rhombus">
      <div className="br-rhombus" />
      <div className="br-plate">
        {pageTurn ? (
          // Scripture page turn: reference stays fixed, only verses slide
          <>
            <div className="br-content">
              <p className="br-text br-text--reference">{(item.content as ScriptureContent).formattedReference}</p>
              <div className="br-verse-area">
                {prevItem && <div className="br-verse-slot br-content--out">{getVerses(prevItem)}</div>}
                <div className="br-verse-slot br-content--in">{getVerses(item)}</div>
              </div>
            </div>
          </>
        ) : (
          // Normal push-up or first show: entire content slides
          <>
            {isPushUp && prevItem && (
              <div className="br-content br-content--out">{renderContent(prevItem)}</div>
            )}
            <div className={`br-content ${isPushUp ? "br-content--in" : ""}`}>{renderContent(item)}</div>
          </>
        )}
      </div>
    </div>
  );
}
