const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const script = path.join(root, "enhancements/quick-access.js");
const styles = path.join(root, "enhancements/quick-access.css");
const fixture = fs.readFileSync(path.join(__dirname, "fixtures/conversation.html"), "utf8");

async function load(page, locale = "en") {
  await page.addInitScript((locale) => {
    const listeners = [];
    // Only the storage API used by quick access is mocked; all DOM, keyboard,
    // modal, scrolling and focus behavior runs in the real browser.
    window.chrome = {
      storage: {
        local: { get: async () => ({ bds_settings: { locale } }) },
        onChanged: { addListener: (fn) => listeners.push(fn) },
      },
    };
    window.setFixtureLocale = (locale) => listeners.forEach((fn) =>
      fn({ bds_settings: { newValue: { locale } } }, "local"),
    );
  }, locale);
  await page.route("https://chat.deepseek.com/**", (route) => route.fulfill({ contentType: "text/html", body: fixture }));
  await page.goto("https://chat.deepseek.com/");
  await page.addStyleTag({ path: styles });
  await page.addScriptTag({ path: script });
}

async function open(page) {
  await page.locator(".bds-qa-launcher").click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test("launcher, keyboard shortcut, modal focus trap and focus restoration", async ({ page }) => {
  await load(page);
  await page.locator("#chat-input").focus();
  await page.keyboard.press("Control+Shift+K");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("searchbox")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Latest message", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator("#chat-input")).toBeFocused();
  await expect(page.locator(".bds-qa-launcher")).toHaveAttribute("aria-expanded", "false");
});

test("search matches Arabic and English, safely highlights text, and navigates to the message", async ({ page }) => {
  await load(page);
  await open(page);
  await page.getByRole("searchbox").fill("PROJECT");
  await expect(page.locator(".bds-qa-result")).toHaveCount(2);
  await expect(page.locator("mark").first()).toHaveText("project");
  await page.getByRole("searchbox").fill("المشروع");
  await expect(page.locator(".bds-qa-result")).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".bds-qa-result")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".ds-message").nth(1)).toHaveAttribute("data-bds-qa-highlight", "");
  await expect(page.locator(".ds-message").nth(1)).toBeFocused();
  await page.locator("#chat-input").focus();
  await expect(page.locator(".ds-message").nth(1)).not.toHaveAttribute("tabindex");
});

test("search treats markup as text and shows a useful empty state", async ({ page }) => {
  await load(page);
  await page.evaluate(() => {
    document.querySelector(".ds-markdown").textContent = '<img src=x onerror="window.injected=true">';
  });
  await open(page);
  await page.getByRole("searchbox").fill("<img");
  await expect(page.locator(".bds-qa-result")).toHaveCount(1);
  await expect(page.locator(".bds-qa-results img")).toHaveCount(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  await page.getByRole("searchbox").fill("no such message");
  await expect(page.getByRole("status")).toHaveText("No matching messages");
  await page.getByRole("searchbox").fill("  ");
  await expect(page.getByRole("button", { name: "Write a message", exact: true })).toBeVisible();
});

test("quick actions open the existing BDS panel, focus the composer, and reach either end", async ({ page }) => {
  await load(page);
  await open(page);
  await page.getByRole("button", { name: "Open BDS panel", exact: true }).click();
  await expect(page.locator("#settings-panel")).toBeVisible();
  await open(page);
  await page.getByRole("button", { name: "Write a message", exact: true }).click();
  await expect(page.locator("#chat-input")).toBeFocused();
  await open(page);
  await page.getByRole("button", { name: "Latest message", exact: true }).click();
  await expect(page.locator(".ds-message").last()).toBeFocused();
  await open(page);
  await page.getByRole("button", { name: "First message", exact: true }).click();
  await expect(page.locator(".ds-message").first()).toBeFocused();
});

test("new and streaming messages refresh search without stealing keyboard focus", async ({ page }) => {
  await load(page);
  await open(page);
  await page.getByRole("searchbox").fill("project");
  await expect(page.locator(".bds-qa-result")).toHaveCount(2);
  await page.keyboard.press("ArrowDown");
  await page.evaluate(() => {
    const message = document.createElement("article");
    message.className = "ds-message";
    message.textContent = "A new project message";
    document.querySelector("#messages").append(message);
  });
  await expect(page.locator(".bds-qa-result")).toHaveCount(3);
  await expect(page.locator(".bds-qa-result").first()).toBeFocused();
  await page.evaluate(() => { document.querySelector(".ds-message:last-child").textContent = "No match now"; });
  await expect(page.locator(".bds-qa-result")).toHaveCount(2);
});

test("large conversations cap rendered results and retain the total count", async ({ page }) => {
  await load(page);
  await page.evaluate(() => {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 2000; i++) {
      const message = document.createElement("article");
      message.className = "ds-message";
      message.textContent = `Scale message ${i}`;
      fragment.append(message);
    }
    document.querySelector("#messages").append(fragment);
  });
  await open(page);
  await page.getByRole("searchbox").fill("Scale");
  await expect(page.locator(".bds-qa-result")).toHaveCount(50);
  await expect(page.getByRole("status")).toContainText("50 of 2000");
  await page.getByRole("searchbox").fill("Scale message 1999");
  await expect(page.locator(".bds-qa-result")).toHaveCount(1);
});

test("empty conversations disable unavailable actions and update on new messages", async ({ page }) => {
  await load(page);
  await page.evaluate(() => { document.querySelector("#messages").replaceChildren(); });
  await open(page);
  await expect(page.getByRole("button", { name: "First message", exact: true })).toBeDisabled();
  await expect(page.getByRole("status")).toHaveText("No messages loaded yet");
  await page.evaluate(() => {
    const message = document.createElement("article");
    message.className = "ds-message";
    message.textContent = "First response";
    document.querySelector("#messages").append(message);
  });
  await expect(page.getByRole("button", { name: "First message", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Latest message", exact: true }).focus();
  await page.evaluate(() => { document.querySelector(".ds-message").textContent = "Streaming response"; });
  await expect(page.getByRole("button", { name: "Latest message", exact: true })).toBeFocused();
});

test("Arabic mobile layout, live locale changes, and explicit page theme", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await load(page, "ar");
  await open(page);
  await expect(page.getByRole("heading", { name: "الوصول السريع" })).toBeVisible();
  await expect(page.locator("#bds-quick-access")).toHaveAttribute("dir", "rtl");
  const bounds = await page.getByRole("dialog").boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(360);
  expect(await page.locator("#bds-quick-access").evaluate((node) => getComputedStyle(node).getPropertyValue("--qa-bg").trim())).toBe("#1c1e26");
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  expect(await page.locator("#bds-quick-access").evaluate((node) => getComputedStyle(node).getPropertyValue("--qa-bg").trim())).toBe("#ffffff");
  await page.screenshot({ path: test.info().outputPath("arabic-mobile.png") });
  await page.evaluate(() => window.setFixtureLocale("en"));
  await expect(page.getByRole("heading", { name: "Quick access" })).toBeVisible();
  await expect(page.locator("#bds-quick-access")).toHaveAttribute("dir", "ltr");
});

test("outside click dismisses the dialog; duplicate loading creates no extra launcher", async ({ page }) => {
  await load(page);
  await page.addScriptTag({ path: script });
  await expect(page.locator(".bds-qa-launcher")).toHaveCount(1);
  await open(page);
  await page.mouse.click(1, 1);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".bds-qa-launcher")).toBeFocused();
});
