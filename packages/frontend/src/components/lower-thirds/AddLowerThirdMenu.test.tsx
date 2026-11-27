import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "../../test/ionicMocks";
import { AddLowerThirdMenu } from "./AddLowerThirdMenu";
import { TEST_ID_LOWER_THIRD_ADD_BUTTON, TEST_ID_LOWER_THIRD_ADD_MENU, TEST_ID_LOWER_THIRD_ADD_OPTION } from "../../constants/testIds";

function renderMenu() {
  const onSelect = vi.fn();
  render(
    <div>
      <AddLowerThirdMenu onSelect={onSelect} />
      <button data-testid="outside">elsewhere</button>
    </div>,
  );
  return { onSelect, addButton: screen.getByTestId(TEST_ID_LOWER_THIRD_ADD_BUTTON) };
}

const menu = (): HTMLElement | null => screen.queryByTestId(TEST_ID_LOWER_THIRD_ADD_MENU);
const option = (type: string): HTMLElement => screen.getByTestId(`${TEST_ID_LOWER_THIRD_ADD_OPTION}-${type}`);

describe("AddLowerThirdMenu", () => {
  it("announces a menu and reflects open state on the Add button", async () => {
    const { addButton } = renderMenu();
    expect(addButton).toHaveAttribute("aria-haspopup", "menu");
    expect(addButton).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(addButton);
    expect(addButton).toHaveAttribute("aria-expanded", "true");
    expect(menu()).toHaveAttribute("role", "menu");
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Title", "Title + Subtitle", "Scripture"]);
  });

  it.each([
    ["Title", "Title"],
    ["TitleSubtitle", "Title + Subtitle"],
    ["Scripture", "Scripture"],
  ])("choosing %s reports it and closes the menu", async (type, label) => {
    const { onSelect, addButton } = renderMenu();
    await userEvent.click(addButton);
    await userEvent.click(screen.getByRole("menuitem", { name: label }));
    expect(onSelect).toHaveBeenCalledWith(type);
    expect(menu()).not.toBeInTheDocument();
  });

  it("moves focus into the menu on open, and arrows move between options with wrap-around", async () => {
    const { addButton } = renderMenu();
    await userEvent.click(addButton);
    expect(option("Title")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(option("TitleSubtitle")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(option("Title")).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(option("Scripture")).toHaveFocus();
  });

  it("Escape closes the menu, selects nothing, and returns focus to Add", async () => {
    const { onSelect, addButton } = renderMenu();
    await userEvent.click(addButton);
    await userEvent.keyboard("{Escape}");
    expect(menu()).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
    expect(addButton).toHaveFocus();
  });

  it("a tap outside closes the menu and selects nothing", async () => {
    const { onSelect, addButton } = renderMenu();
    await userEvent.click(addButton);
    fireEvent.pointerDown(screen.getByTestId("outside"));
    expect(menu()).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("a tap inside the menu does not close it before the option click lands", async () => {
    renderMenu();
    await userEvent.click(screen.getByTestId(TEST_ID_LOWER_THIRD_ADD_BUTTON));
    fireEvent.pointerDown(option("Scripture"));
    expect(menu()).toBeInTheDocument();
  });

  it("tapping Add again closes the menu", async () => {
    const { addButton } = renderMenu();
    await userEvent.click(addButton);
    await userEvent.click(addButton);
    expect(menu()).not.toBeInTheDocument();
  });
});
