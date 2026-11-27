import { useEffect, useRef, useState } from "react";
import type { ComponentRef, KeyboardEvent, ReactNode } from "react";
import { IonButton } from "@ionic/react";
import type { LowerThirdType } from "@invisible-av-booth/shared";
import { TEST_ID_LOWER_THIRD_ADD_BUTTON, TEST_ID_LOWER_THIRD_ADD_MENU, TEST_ID_LOWER_THIRD_ADD_OPTION } from "../../constants/testIds";

interface AddLowerThirdMenuProps {
  onSelect: (type: LowerThirdType) => void;
}

const OPTIONS: Array<{ type: LowerThirdType; label: string }> = [
  { type: "Title", label: "Title" },
  { type: "TitleSubtitle", label: "Title + Subtitle" },
  { type: "Scripture", label: "Scripture" },
];

/**
 * "Add" button and its type menu at the bottom of the Lower Thirds widget (lower-thirds spec Req 5.10).
 *
 * Accessibility, because this is tapped live on a tablet and the original fell short:
 * - Every target is at least 2.75rem tall with a gap between options (was 2rem, edge to edge).
 * - Keyboard: visible focus ring, Up/Down move between options, Escape closes and returns focus to Add.
 * - Closes on a tap/click outside, so an opened menu never lingers over the library.
 * - `aria-haspopup`/`aria-expanded` on Add and `menu`/`menuitem` roles so screen readers announce it.
 */
export function AddLowerThirdMenu({ onSelect }: AddLowerThirdMenuProps): ReactNode {
  const [open, setOpen] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // ComponentRef derives the Ionic element type without naming the HTMLIonButtonElement global (ESLint no-undef).
  const addButtonRef = useRef<ComponentRef<typeof IonButton>>(null);

  const close = (returnFocus: boolean): void => {
    setOpen(false);
    if (returnFocus) addButtonRef.current?.focus();
  };

  // Outside tap/click closes. pointerdown (not click) so the menu is gone before the tap lands on
  // whatever is underneath, and it covers touch, mouse, and pen.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (areaRef.current && !areaRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Opening moves focus to the first option so keyboard users land in the menu.
  useEffect(() => {
    if (open) optionRefs.current[0]?.focus();
  }, [open]);

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const index = optionRefs.current.findIndex((option) => option === document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      optionRefs.current[(index + 1) % OPTIONS.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      optionRefs.current[(index - 1 + OPTIONS.length) % OPTIONS.length]?.focus();
    }
  };

  // aria-expanded is passed as a string: Ionic renders a boolean false as an empty attribute, which
  // screen readers do not announce as "collapsed".
  return (
    <div className="lt-add-area" ref={areaRef}>
      <IonButton
        ref={addButtonRef}
        expand="block"
        fill="outline"
        size="small"
        className="lt-add-button"
        data-testid={TEST_ID_LOWER_THIRD_ADD_BUTTON}
        aria-haspopup="menu"
        aria-expanded={open ? "true" : "false"}
        onClick={() => setOpen(!open)}
      >
        Add
      </IonButton>
      {open && (
        <div className="lt-add-dropdown" role="menu" aria-label="Add lower third" data-testid={TEST_ID_LOWER_THIRD_ADD_MENU} onKeyDown={handleMenuKeyDown}>
          {OPTIONS.map((option, index) => (
            <button
              key={option.type}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              type="button"
              role="menuitem"
              className="lt-add-option"
              data-testid={`${TEST_ID_LOWER_THIRD_ADD_OPTION}-${option.type}`}
              onClick={() => {
                close(false);
                onSelect(option.type);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
