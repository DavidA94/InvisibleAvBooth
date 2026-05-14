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

export function BlueRhombusStyle({ item, prevItem, phase, isPushUp, onAnimationEnd }: BlueRhombusStyleProps): ReactNode {
  return (
    <div className={`br-wrapper br-phase--${phase} ${isPushUp ? "br-push-up" : ""}`} onAnimationEnd={onAnimationEnd} data-testid="blue-rhombus">
      <div className="br-rhombus" />
      <div className="br-plate">
        {/* Push-up: old content slides out, new slides in */}
        {isPushUp && prevItem && (
          <div className="br-content br-content--out">{renderContent(prevItem)}</div>
        )}
        <div className={`br-content ${isPushUp ? "br-content--in" : ""}`}>{renderContent(item)}</div>
      </div>
    </div>
  );
}
