import type { ReactNode } from "react";
import type { LowerThirdItem, TitleContent, TitleSubtitleContent, ScriptureContent, AnimationPhase } from "@invisible-av-booth/shared";
import "./BlueRhombusStyle.css";

interface BlueRhombusStyleProps {
  item: LowerThirdItem;
  phase: AnimationPhase;
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
        ? content.verses.filter((v) => v.verseNumber >= pageInfo.startVerse && v.verseNumber <= pageInfo.endVerse)
        : content.verses;

      return (
        <>
          <p className="br-text br-text--reference">{content.formattedReference}</p>
          <div className="br-verses">
            {verses.map((v) => (
              <p key={v.verseNumber} className={`br-verse ${v.verseNumber === 0 ? "br-verse--zero" : ""}`}>
                {v.verseNumber > 0 && <span className="br-verse-num">{v.verseNumber}. </span>}
                {v.text}
              </p>
            ))}
          </div>
        </>
      );
    }
  }
}

export function BlueRhombusStyle({ item, phase, onAnimationEnd }: BlueRhombusStyleProps): ReactNode {
  return (
    <div className={`br-wrapper br-phase--${phase}`} onAnimationEnd={onAnimationEnd} data-testid="blue-rhombus">
      <div className="br-rhombus" />
      <div className="br-plate">
        <div className="br-content">{renderContent(item)}</div>
      </div>
    </div>
  );
}
