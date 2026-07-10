import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BlueRhombusStyle } from "./BlueRhombusStyle";
import { TEST_ID_BLUE_RHOMBUS } from "../../constants/testIds";
import type { LowerThirdItem } from "@invisible-av-booth/shared";

vi.mock("./BlueRhombusStyle.css", () => ({}));

const titleItem = { id: "1", type: "Title", content: { title: "Speaker" } } as unknown as LowerThirdItem;
const subtitleItem = { id: "2", type: "TitleSubtitle", content: { title: "John", subtitle: "Pastor" } } as unknown as LowerThirdItem;

describe("BlueRhombusStyle", () => {
  it("renders Title content", () => {
    render(<BlueRhombusStyle item={titleItem} phase="visible" onAnimationEnd={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_BLUE_RHOMBUS)).toBeInTheDocument();
    expect(screen.getByText("Speaker")).toBeInTheDocument();
  });

  it("renders TitleSubtitle content", () => {
    render(<BlueRhombusStyle item={subtitleItem} phase="visible" onAnimationEnd={vi.fn()} />);
    expect(screen.getByText("John")).toBeInTheDocument();
    expect(screen.getByText("Pastor")).toBeInTheDocument();
  });

  it("applies hidden phase", () => {
    render(<BlueRhombusStyle item={titleItem} phase="hidden" onAnimationEnd={vi.fn()} />);
    const el = screen.getByTestId(TEST_ID_BLUE_RHOMBUS);
    expect(el.className).toContain("hidden");
  });
});
