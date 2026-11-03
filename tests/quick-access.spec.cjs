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
  await page.addScriptTag({ path: path.join(root, "enhancements/conversation-tools.js") });
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
  await expect(page.getByRole("tab", { name: /^Messages/ })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Save messages as JSON", exact: true })).toBeFocused();
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

async function addCode(page, content, filename = "example.py", language = "python") {
  await page.evaluate(({ content, filename, language }) => {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.className = `language-${language}`;
    code.dataset.filename = filename;
    code.textContent = content;
    pre.append(code);
    document.querySelector(".ds-message:last-child .ds-markdown").append(pre);
  }, { content, filename, language });
}

test("code files are searchable by filename, language and text without executing markup", async ({ page }) => {
  await load(page);
  await addCode(page, 'print("مرحبا")\n# <img src=x onerror="window.injected=true">', "greeting.py");
  await open(page);
  await page.getByRole("tab", { name: /^Code files/ }).click();
  await expect(page.locator(".bds-qa-file h3")).toHaveText("greeting.py");
  await expect(page.locator(".bds-qa-file img")).toHaveCount(0);
  for (const query of ["greeting.py", "python", "مرحبا"]) {
    await page.getByRole("searchbox").fill(query);
    await expect(page.locator(".bds-qa-file")).toHaveCount(1);
  }
  await page.getByRole("searchbox").fill("no code here");
  await expect(page.getByRole("status")).toHaveText("No matching code files");
  await page.getByRole("tab", { name: /^Messages/ }).click();
  await page.getByRole("searchbox").fill("project");
  await page.getByRole("tab", { name: /^Code files/ }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("no code here");
  await page.getByRole("tab", { name: /^Code files/ }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("no code here");
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
});

test("downloads contain the complete original code and safe filenames", async ({ page }) => {
  await load(page);
  const content = '# ملف عربي\n' + '    print("exact indentation and newlines")\n'.repeat(100);
  await addCode(page, content, "../../CON.py");
  await open(page);
  await page.getByRole("tab", { name: /^Code files/ }).click();
  await expect(page.locator(".bds-qa-file pre")).not.toHaveText(content);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download file", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^code-\d+-1\.py$/);
  expect(fs.readFileSync(await download.path(), "utf8")).toBe(content);
  await expect(page.locator(".bds-qa-feedback")).toHaveText("Download started");
});

test("copy uses the complete code and clipboard failures give a recovery action", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await load(page);
  const content = 'print("مرحبا")\n'.repeat(150);
  await addCode(page, content);
  await open(page);
  await page.getByRole("tab", { name: /^Code files/ }).click();
  await page.getByRole("button", { name: "Copy code", exact: true }).click();
  await expect(page.locator(".bds-qa-feedback")).toHaveText("Code copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(content);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async () => { throw new Error("Clipboard denied"); },
    } });
  });
  await page.getByRole("button", { name: "Copy code", exact: true }).click();
  await expect(page.locator(".bds-qa-feedback")).toContainText("Copy failed");
  await expect(page.getByRole("button", { name: "Download file", exact: true })).toBeEnabled();
});

test("filtered JSON export includes every match beyond the preview limit and correct roles", async ({ page }) => {
  await load(page);
  await page.evaluate(() => {
    const messages = document.querySelector("#messages");
    for (let i = 0; i < 70; i++) {
      const message = document.createElement("article");
      message.className = "ds-message";
      message.dataset.role = i % 2 ? "assistant" : "user";
      message.textContent = `Export match ${i}`;
      messages.append(message);
    }
  });
  await open(page);
  await page.getByRole("searchbox").fill("EXPORT MATCH");
  await expect(page.locator(".bds-qa-result")).toHaveCount(50);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save messages as JSON", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("better-deepseek-messages.json");
  const data = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
  expect(data.messages).toHaveLength(70);
  expect(data.messages[0]).toEqual({ role: "user", text: "Export match 0" });
  expect(data.messages[69]).toEqual({ role: "assistant", text: "Export match 69" });
});

test("Markdown export preserves Arabic text and only exports matching messages", async ({ page }) => {
  await load(page, "ar");
  await open(page);
  await page.getByRole("searchbox").fill("المشروع");
  await expect(page.locator(".bds-qa-result")).toHaveCount(1);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "حفظ الرسائل بصيغة Markdown", exact: true }).click();
  const download = await downloading;
  const content = fs.readFileSync(await download.path(), "utf8");
  expect(content).toContain("ابدأ بتحديد أهداف المشروع");
  expect(content).not.toContain("Save your favorite prompts");
  expect(content).not.toContain("حفظ الرسائل");
});

test("search reuses indexed messages and only reads changed text", async ({ page }) => {
  await load(page);
  await page.evaluate(() => {
    window.textReads = [0, 0, 0];
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "innerText");
    document.querySelectorAll(".ds-markdown").forEach((body, i) => Object.defineProperty(body, "innerText", {
      get() { window.textReads[i]++; return descriptor.get.call(this); },
    }));
  });
  await open(page);
  for (const query of ["project", "prompts", "المشروع"]) {
    await page.getByRole("searchbox").fill(query);
    await expect(page.locator(".bds-qa-result")).toHaveCount(query === "project" ? 2 : 1);
  }
  expect(await page.evaluate(() => window.textReads)).toEqual([1, 1, 1]);
  await page.evaluate(() => { document.querySelectorAll(".ds-markdown")[1].textContent = "Changed message"; });
  await page.getByRole("searchbox").fill("Changed");
  await expect(page.locator(".bds-qa-result")).toHaveCount(1);
  await expect(page.locator(".bds-qa-result")).toContainText("Changed message");
  expect(await page.evaluate(() => window.textReads)).toEqual([1, 2, 1]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await open(page);
  expect(await page.evaluate(() => window.textReads)).toEqual([2, 3, 2]);
});

test("result focus stays on the same message when an earlier match disappears", async ({ page }) => {
  await load(page);
  await open(page);
  await page.getByRole("searchbox").fill("project");
  await expect(page.locator(".bds-qa-result")).toHaveCount(2);
  await page.locator(".bds-qa-result").last().focus();
  await page.evaluate(() => { document.querySelector(".ds-message").remove(); });
  await expect(page.locator(".bds-qa-result")).toHaveCount(1);
  await expect(page.locator(".bds-qa-result")).toBeFocused();
  await expect(page.locator(".bds-qa-result")).toContainText("favorite prompts");
});

test("code previews update during streaming and empty tabs support Arabic keyboard navigation", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await load(page, "ar");
  await open(page);
  await page.getByRole("tab", { name: /^الرسائل/ }).focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: /^ملفات الأكواد/ })).toBeFocused();
  await expect(page.getByRole("status")).toHaveText("لا توجد أكواد في الرسائل المحمّلة");
  await addCode(page, 'print("first")', "مشروع.py");
  await expect(page.locator(".bds-qa-file")).toHaveCount(1);
  await page.getByRole("button", { name: "تنزيل الملف", exact: true }).focus();
  await page.evaluate(() => { document.querySelector("pre code").textContent += '\nprint("second")'; });
  await expect(page.locator(".bds-qa-file pre")).toContainText("second");
  await expect(page.getByRole("button", { name: "تنزيل الملف", exact: true })).toBeFocused();
  const bounds = await page.getByRole("dialog").boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  await page.screenshot({ path: test.info().outputPath("arabic-files-mobile.png") });
});

test("a clipboard operation finishing after reopening does not show stale feedback", async ({ page }) => {
  await load(page);
  await addCode(page, "print(1)");
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
    writeText: () => new Promise((resolve) => { window.finishCopy = resolve; }),
  } }));
  await open(page);
  await page.getByRole("tab", { name: /^Code files/ }).click();
  await page.getByRole("button", { name: "Copy code", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await open(page);
  await page.evaluate(() => window.finishCopy());
  await expect(page.locator(".bds-qa-feedback")).toBeEmpty();
});
