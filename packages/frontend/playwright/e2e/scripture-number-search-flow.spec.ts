import { test, expect, type Locator, type Page, type WebSocketRoute } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { authLoginSuccess } from "../fixtures/payloads/auth";
import {
  TEST_ID_LOGIN_USERNAME,
  TEST_ID_LOGIN_PASSWORD,
  TEST_ID_LOGIN_SUBMIT,
  TEST_ID_LOWER_THIRD_WIDGET,
  TEST_ID_LOWER_THIRD_ADD_DIALOG,
  TEST_ID_LOWER_THIRD_ADD_SAVE,
  TEST_ID_SCRIPTURE_BOOK_SELECT,
  TEST_ID_SCRIPTURE_CHAPTER_SELECT,
  TEST_ID_SCRIPTURE_VERSE_SELECT,
  TEST_ID_SCRIPTURE_VERSE_END_SELECT,
} from "../../src/constants/testIds";

/**
 * Numbers-only type to search in the scripture chapter / verse dropdowns
 * (livestream-control-system spec Req 19.10), exercised through the lower-thirds Add Scripture dialog.
 */

const volunteerLogin = authLoginSuccess({ role: "AvVolunteer" });

const emptyLowerThirds = {
  active: null,
  library: [],
  phase: "hidden",
  autoDismissAt: null,
  overlayConnected: true,
  overlayResolutionCorrect: true,
  transitionLocked: false,
  overlayStale: false,
};

async function setupSocket(page: Page): Promise<{ commands: () => unknown[] }> {
  const commands: unknown[] = [];
  await page.routeWebSocket("**/socket.io/*", (ws: WebSocketRoute) => {
    ws.send('0{"sid":"mock-ws-sid","upgrades":[],"pingInterval":25000,"pingTimeout":60000}');
    ws.onMessage((message) => {
      const text = typeof message === "string" ? message : "";
      if (text === "2") {
        ws.send("3");
        return;
      }
      if (text === "40") {
        ws.send('40{"sid":"mock-ws-sid"}');
        return;
      }
      if (text.includes('"cts:request:initial:state"')) {
        ws.send(`42["stc:lower-third:state",${JSON.stringify(emptyLowerThirds)}]`);
        return;
      }
      // Ack replies must be ACK packets ("43<id>"), not EVENT packets ("42<id>").
      const match = text.match(/^42(\d*)\["cts:lower-third:command",(.*)\]$/);
      if (match) {
        commands.push(JSON.parse(match[2]!));
        ws.send(`43${match[1]}[{"success":true}]`);
      }
    });
  });
  return { commands: () => commands };
}

async function openAddScripture(page: Page): Promise<{ commands: () => unknown[] }> {
  await routeAuthLogin(page, volunteerLogin);
  await routeAuthCheck(page, volunteerLogin);
  await page.route("**/api/dashboards", (route) => route.fulfill({ json: [{ id: "default", name: "Main", description: "" }] }));
  await page.route("**/api/dashboards/*/layout", (route) =>
    route.fulfill({
      json: { version: 1, cells: [{ widgetId: "lower-thirds", title: "Lower Thirds", col: 0, row: 0, colSpan: 3, rowSpan: 3, roleMinimum: "AvVolunteer" }] },
    }),
  );
  const socket = await setupSocket(page);
  await page.goto("/login");
  await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
  await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
  await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();
  await expect(page.getByTestId(TEST_ID_LOWER_THIRD_WIDGET)).toBeVisible({ timeout: 15000 });
  await page.locator("ion-button", { hasText: "Add" }).click();
  await page
    .locator(".lt-add-option")
    .filter({ hasText: /^Scripture$/ })
    .click();
  await expect(page.getByTestId(TEST_ID_LOWER_THIRD_ADD_DIALOG)).toBeVisible();
  return socket;
}

const input = (page: Page, testId: string): Locator => page.getByTestId(testId).locator("input");

test.describe("Scripture chapter/verse — numbers-only type to search", () => {
  test("chapter, verse, and end request the numeric keypad; book does not", async ({ page }) => {
    await openAddScripture(page);
    for (const testId of [TEST_ID_SCRIPTURE_CHAPTER_SELECT, TEST_ID_SCRIPTURE_VERSE_SELECT, TEST_ID_SCRIPTURE_VERSE_END_SELECT]) {
      await expect(input(page, testId)).toHaveAttribute("inputmode", "numeric");
      await expect(input(page, testId)).toHaveAttribute("pattern", "[0-9]*");
    }
    await expect(input(page, TEST_ID_SCRIPTURE_BOOK_SELECT)).not.toHaveAttribute("inputmode", "numeric");
  });

  test("letters are discarded and the list filters by leading digits", async ({ page }) => {
    await openAddScripture(page);
    await input(page, TEST_ID_SCRIPTURE_BOOK_SELECT).fill("Psalms");
    await page.keyboard.press("Enter");

    const chapter = input(page, TEST_ID_SCRIPTURE_CHAPTER_SELECT);
    await chapter.click();
    await chapter.pressSequentially("1x1");
    await expect(chapter).toHaveValue("11");
    const options = page.getByRole("option");
    await expect(options.first()).toHaveText("11");
    await expect(page.getByRole("option", { name: "21", exact: true })).toHaveCount(0);
  });

  test("typing the reference end to end adds the right scripture", async ({ page }) => {
    const socket = await openAddScripture(page);
    await input(page, TEST_ID_SCRIPTURE_BOOK_SELECT).fill("John");
    await page.getByRole("option", { name: "John", exact: true }).click();

    await input(page, TEST_ID_SCRIPTURE_CHAPTER_SELECT).click();
    await page.keyboard.type("3");
    await page.keyboard.press("Enter");
    await input(page, TEST_ID_SCRIPTURE_VERSE_SELECT).click();
    await page.keyboard.type("16");
    await page.keyboard.press("Enter");
    await input(page, TEST_ID_SCRIPTURE_VERSE_END_SELECT).click();
    await page.keyboard.type("18");
    await page.keyboard.press("Enter");

    await page.getByTestId(TEST_ID_LOWER_THIRD_ADD_SAVE).click();
    await expect
      .poll(() => socket.commands())
      .toEqual([{ type: "add-to-library", input: { type: "Scripture", content: { reference: { bookId: 43, chapter: 3, verse: 16, verseEnd: 18 } } } }]);
  });

  // Auto-advance (Req 19.11): picking a value moves focus to the next field when it is empty.
  const isFocused = (locator: Locator): Promise<boolean> => locator.evaluate((element) => element === document.activeElement);

  test("tapping options directly walks Book → Ch → Verse → End", async ({ page }) => {
    await openAddScripture(page);
    await input(page, TEST_ID_SCRIPTURE_BOOK_SELECT).fill("John");
    await page.getByRole("option", { name: "John", exact: true }).click();
    await expect.poll(() => isFocused(input(page, TEST_ID_SCRIPTURE_CHAPTER_SELECT))).toBe(true);

    await page.getByTestId(TEST_ID_SCRIPTURE_CHAPTER_SELECT).click();
    await page.getByRole("option", { name: "3", exact: true }).click();
    await expect.poll(() => isFocused(input(page, TEST_ID_SCRIPTURE_VERSE_SELECT))).toBe(true);

    await page.getByTestId(TEST_ID_SCRIPTURE_VERSE_SELECT).click();
    await page.getByRole("option", { name: "16", exact: true }).click();
    await expect.poll(() => isFocused(input(page, TEST_ID_SCRIPTURE_VERSE_END_SELECT))).toBe(true);
  });

  test("a whole reference can be typed without touching the next field", async ({ page }) => {
    const socket = await openAddScripture(page);
    await input(page, TEST_ID_SCRIPTURE_BOOK_SELECT).fill("John");
    await page.getByRole("option", { name: "John", exact: true }).click();
    // No clicks from here on: focus advances by itself.
    await page.keyboard.type("3");
    await page.keyboard.press("Enter");
    await page.keyboard.type("16");
    await page.keyboard.press("Enter");
    await page.keyboard.type("18");
    await page.keyboard.press("Enter");

    await page.getByTestId(TEST_ID_LOWER_THIRD_ADD_SAVE).click();
    await expect
      .poll(() => socket.commands())
      .toEqual([{ type: "add-to-library", input: { type: "Scripture", content: { reference: { bookId: 43, chapter: 3, verse: 16, verseEnd: 18 } } } }]);
  });

  test("changing the book on a filled reference does not jump to Chapter", async ({ page }) => {
    await openAddScripture(page);
    await input(page, TEST_ID_SCRIPTURE_BOOK_SELECT).fill("John");
    await page.getByRole("option", { name: "John", exact: true }).click();
    await page.keyboard.type("3");
    await page.keyboard.press("Enter");

    await input(page, TEST_ID_SCRIPTURE_BOOK_SELECT).click();
    await input(page, TEST_ID_SCRIPTURE_BOOK_SELECT).fill("Acts");
    await page.getByRole("option", { name: "Acts", exact: true }).click();

    expect(await isFocused(input(page, TEST_ID_SCRIPTURE_CHAPTER_SELECT))).toBe(false);
    await expect(page.getByTestId(TEST_ID_SCRIPTURE_CHAPTER_SELECT)).toContainText("3");
  });
});

// On touch devices react-select blurs the field after every selection (blurInputOnSelect). This
// checks that auto-advance still lands focus on the next field there, i.e. the keyboard stays up.
test.describe("Scripture auto-advance — touch device", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 1280, height: 800 } });

  test("tapping Book, Chapter, and Verse options keeps focus moving forward", async ({ page }) => {
    await openAddScripture(page);
    const isFocused = (locator: Locator): Promise<boolean> => locator.evaluate((element) => element === document.activeElement);

    await input(page, TEST_ID_SCRIPTURE_BOOK_SELECT).fill("John");
    await page.getByRole("option", { name: "John", exact: true }).tap();
    await expect.poll(() => isFocused(input(page, TEST_ID_SCRIPTURE_CHAPTER_SELECT))).toBe(true);

    await page.keyboard.type("3");
    await page.getByRole("option", { name: "3", exact: true }).tap();
    await expect.poll(() => isFocused(input(page, TEST_ID_SCRIPTURE_VERSE_SELECT))).toBe(true);

    await page.keyboard.type("16");
    await page.getByRole("option", { name: "16", exact: true }).tap();
    await expect.poll(() => isFocused(input(page, TEST_ID_SCRIPTURE_VERSE_END_SELECT))).toBe(true);
  });
});
