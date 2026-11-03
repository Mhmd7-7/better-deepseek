/* Quick navigation for the packaged Chrome extension. No build step required. */
(() => {
  "use strict";

  const ROOT_ID = "bds-quick-access";
  const RESULT_LIMIT = 50;
  const { ConversationIndex, downloadText, serializeMessages } = globalThis.BDSQuickAccessTools;
  const ICONS = {
    compose: ["M15 5h4v4M19 5 9 15", "M19 13v6H5V5h6"],
    settings: ["M4 6h6m4 0h6M4 12h10m4 0h2M4 18h2m4 0h10", "M10 3v6m4 0v6M6 15v6"],
    first: ["m6 13 6-6 6 6M12 7v13M5 3h14"],
    last: ["m6 11 6 6 6-6M12 17V4M5 21h14"],
  };
  const COPY = {
    en: {
      title: "Quick access", subtitle: "A shorter path through your conversation",
      open: "Open quick access", close: "Close", search: "Search this conversation…",
      hint: "Searches messages loaded in this tab. Nothing leaves your browser.",
      settings: "Open BDS panel", compose: "Write a message",
      first: "First message", last: "Latest message", empty: "No matching messages",
      noMessages: "No messages loaded yet", message: "Message",
      count: (shown, total) => shown === total ? `${total} matching messages` : `Showing ${shown} of ${total} matches — refine your search`,
      keyboard: "↑ ↓ Navigate · Enter Select · Esc Close",
      messages: "Messages", files: "Code files", searchFiles: "Search code, filenames or languages…",
      noFiles: "No code files in the loaded messages", emptyFiles: "No matching code files",
      fileCount: (shown, total) => shown === total ? `${total} code files` : `Showing ${shown} of ${total} code files — refine your search`,
      saveMessages: (count) => `Save messages (${count})`, markdown: "Save messages as Markdown", json: "Save messages as JSON",
      copy: "Copy code", download: "Download file", copied: "Code copied", copyFailed: "Copy failed. Download the file to keep the complete code.",
      saved: "Download started", saveFailed: "Could not create the download. Try again.",
      user: "You", assistant: "Assistant",
    },
    ar: {
      title: "الوصول السريع", subtitle: "تنقّل بسهولة داخل محادثتك",
      open: "فتح الوصول السريع", close: "إغلاق", search: "ابحث في هذه المحادثة…",
      hint: "يبحث في الرسائل المحمّلة في هذه الصفحة فقط. البحث محلي داخل متصفحك.",
      settings: "فتح لوحة BDS", compose: "كتابة رسالة",
      first: "أول رسالة", last: "آخر رسالة", empty: "لا توجد رسائل مطابقة",
      noMessages: "لم تُحمّل أي رسائل بعد", message: "رسالة",
      count: (shown, total) => shown === total ? `${total} من الرسائل المطابقة` : `عرض ${shown} من ${total} نتيجة — حدّد بحثك أكثر`,
      keyboard: "↑ ↓ للتنقّل · Enter للاختيار · Esc للإغلاق",
      messages: "الرسائل", files: "ملفات الأكواد", searchFiles: "ابحث في الكود أو اسم الملف أو اللغة…",
      noFiles: "لا توجد أكواد في الرسائل المحمّلة", emptyFiles: "لا توجد ملفات أكواد مطابقة",
      fileCount: (shown, total) => shown === total ? `${total} من ملفات الأكواد` : `عرض ${shown} من ${total} ملف كود — حدّد بحثك أكثر`,
      saveMessages: (count) => `حفظ الرسائل (${count})`, markdown: "حفظ الرسائل بصيغة Markdown", json: "حفظ الرسائل بصيغة JSON",
      copy: "نسخ الكود", download: "تنزيل الملف", copied: "تم نسخ الكود", copyFailed: "تعذّر النسخ. يمكنك تنزيل الملف للاحتفاظ بالكود كاملًا.",
      saved: "بدأ تنزيل الملف", saveFailed: "تعذّر تجهيز التنزيل. حاول مرة أخرى.",
      user: "أنت", assistant: "المساعد",
    },
  };

  function mount() {
    if (document.getElementById(ROOT_ID)) return;

    let locale = navigator.language || document.documentElement.lang || "en";
    let previousFocus = null;
    let searchTimer;
    let refreshTimer;
    let highlightTimer;
    let highlightedMessage = null;
    let observer = null;
    let activeTab = "messages";
    const queries = { messages: "", files: "" };
    let feedbackTimer;
    let session = 0;
    const index = new ConversationIndex();
    const root = document.createElement("div");
    root.id = ROOT_ID;
    // All markup is static. Conversation text is inserted with textContent only.
    root.innerHTML = `
      <button class="bds-qa-launcher" type="button" aria-haspopup="dialog" aria-controls="bds-qa-dialog">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M14 17.5h7m-3.5-3.5v7"/></svg>
        <span data-copy="title"></span>
      </button>
      <dialog id="bds-qa-dialog" aria-labelledby="bds-qa-title" aria-describedby="bds-qa-hint">
        <header class="bds-qa-header">
          <div><span class="bds-qa-brand" dir="ltr">BDS</span><h2 id="bds-qa-title" data-copy="title"></h2><p data-copy="subtitle"></p></div>
          <button class="bds-qa-close" type="button"><span aria-hidden="true">×</span></button>
        </header>
        <div class="bds-qa-tabs" role="tablist" aria-label="Better DeepSeek">
          <button type="button" role="tab" id="bds-qa-messages-tab" aria-controls="bds-qa-messages-panel" aria-selected="true" data-tab="messages"><span data-copy="messages"></span><span class="bds-qa-badge" data-count="messages">0</span></button>
          <button type="button" role="tab" id="bds-qa-files-tab" aria-controls="bds-qa-files-panel" aria-selected="false" tabindex="-1" data-tab="files"><span data-copy="files"></span><span class="bds-qa-badge" data-count="files">0</span></button>
        </div>
        <div class="bds-qa-search-wrap">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
          <input class="bds-qa-search" type="search" autocomplete="off" spellcheck="false" maxlength="200" aria-describedby="bds-qa-hint" autofocus>
        </div>
        <p id="bds-qa-hint" data-copy="hint"></p>
        <p class="bds-qa-status" role="status" aria-live="polite" aria-atomic="true"></p>
        <section id="bds-qa-messages-panel" role="tabpanel" aria-labelledby="bds-qa-messages-tab">
          <div class="bds-qa-actions"></div>
          <div class="bds-qa-export"><span></span><button type="button" data-export="markdown">.md</button><button type="button" data-export="json">.json</button></div>
          <div class="bds-qa-results"></div>
        </section>
        <section id="bds-qa-files-panel" role="tabpanel" aria-labelledby="bds-qa-files-tab" hidden><div class="bds-qa-file-results"></div></section>
        <p class="bds-qa-feedback" aria-live="polite" aria-atomic="true"></p>
        <footer><span data-copy="keyboard"></span><kbd dir="ltr"></kbd></footer>
      </dialog>`;
    document.body.append(root);

    const dialog = root.querySelector("dialog");
    const launcher = root.querySelector(".bds-qa-launcher");
    const search = root.querySelector("input");
    const actions = root.querySelector(".bds-qa-actions");
    const results = root.querySelector(".bds-qa-results");
    const fileResults = root.querySelector(".bds-qa-file-results");
    const feedback = root.querySelector(".bds-qa-feedback");
    const status = root.querySelector(".bds-qa-status");
    const closeButton = root.querySelector(".bds-qa-close");
    const text = () => COPY[/^ar(?:-|$)/i.test(locale) ? "ar" : "en"];
    const messages = () => index.messages().map((entry) => entry.node);
    const isVisible = (node) => node && node.getClientRects().length > 0;
    const composer = () => Array.from(document.querySelectorAll(
      '#chat-input, textarea[placeholder], [contenteditable="true"][role="textbox"], div[contenteditable="true"]',
    )).find((node) => !root.contains(node) && !node.closest("#bds-root") && !node.disabled && !node.readOnly && isVisible(node));

    function clearHighlight() {
      clearTimeout(highlightTimer);
      highlightedMessage?.removeAttribute("data-bds-qa-highlight");
      highlightedMessage = null;
    }

    function runAction(action) {
      dialog.close();
      // Run after the native dialog restores focus to its opener.
      requestAnimationFrame(action);
    }

    function visitMessage(message) {
      if (!message?.isConnected) return;
      clearHighlight();
      highlightedMessage = message;
      message.setAttribute("data-bds-qa-highlight", "");
      message.scrollIntoView({
        block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      });
      if (!message.hasAttribute("tabindex")) {
        message.setAttribute("tabindex", "-1");
        message.addEventListener("blur", () => message.removeAttribute("tabindex"), { once: true });
      }
      message.focus({ preventScroll: true });
      highlightTimer = setTimeout(clearHighlight, 2400);
    }

    function createAction(label, iconName, available, action) {
      const button = document.createElement("button");
      button.type = "button";
      button.disabled = !available;
      const icon = document.createElement("span");
      icon.className = "bds-qa-action-icon";
      icon.setAttribute("aria-hidden", "true");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      for (const [name, value] of Object.entries({ viewBox: "0 0 24 24", width: "21", height: "21", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" })) svg.setAttribute(name, value);
      ICONS[iconName].forEach((d) => {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        svg.append(path);
      });
      icon.append(svg);
      const name = document.createElement("span");
      name.textContent = label;
      button.append(icon, name);
      button.addEventListener("click", () => runAction(action));
      return button;
    }

    function renderActions() {
      const t = text();
      const items = messages();
      const toggle = document.getElementById("bds-toggle");
      if (!actions.children.length) {
        actions.replaceChildren(
          createAction(t.compose, "compose", !!composer(), () => composer()?.focus()),
          createAction(t.settings, "settings", isVisible(toggle), () => document.getElementById("bds-toggle")?.click()),
          createAction(t.first, "first", items.length > 0, () => visitMessage(document.querySelector(".ds-message"))),
          createAction(t.last, "last", items.length > 0, () => visitMessage(Array.from(document.querySelectorAll(".ds-message")).at(-1))),
        );
      }
      const enabled = [!!composer(), isVisible(toggle), items.length > 0, items.length > 0];
      const focused = document.activeElement;
      [...actions.children].forEach((button, i) => { button.disabled = !enabled[i]; });
      if (actions.contains(focused) && focused.disabled) search.focus();
    }

    function notify(message) {
      clearTimeout(feedbackTimer);
      feedback.textContent = message;
      feedbackTimer = setTimeout(() => { feedback.textContent = ""; }, 4000);
    }

    function filteredMessages() {
      const query = search.value.trim().toLowerCase();
      return index.messages().filter((entry) => entry.searchable.includes(query));
    }

    function saveMessages(format) {
      // Process pending mutations before exporting, even during a streamed reply.
      if (observer) index.invalidate(observer.takeRecords());
      const entries = filteredMessages();
      if (!entries.length) return;
      try {
        const extension = format === "json" ? "json" : "md";
        downloadText(serializeMessages(entries, format, document.title, text()),
          `better-deepseek-messages.${extension}`, format === "json" ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8");
        notify(text().saved);
      } catch { notify(text().saveFailed); }
    }

    function renderFiles(entries, query) {
      const files = entries.flatMap((entry) => entry.files).filter((file) => file.searchable.includes(query));
      const fragment = document.createDocumentFragment();
      files.slice(0, RESULT_LIMIT).forEach((file) => {
        const card = document.createElement("article");
        card.className = "bds-qa-file";
        card.dataset.qaKey = file.id;
        const title = document.createElement("h3");
        title.textContent = file.filename;
        title.dir = "auto";
        const meta = document.createElement("span");
        meta.className = "bds-qa-file-meta";
        meta.textContent = `${file.language} · ${file.size.toLocaleString()} B`;
        const preview = document.createElement("pre");
        preview.dir = "ltr";
        // Bound the preview, while copy/download always use the complete code.
        preview.textContent = file.text.length > 1200 ? file.text.slice(0, 1200) + "\n…" : file.text;
        const controls = document.createElement("div");
        const copy = document.createElement("button");
        copy.type = "button";
        copy.textContent = text().copy;
        copy.dataset.qaAction = "copy";
        copy.addEventListener("click", async () => {
          const openedSession = session;
          copy.disabled = true;
          try {
            await navigator.clipboard.writeText(file.code.isConnected ? file.code.textContent : file.text);
            if (dialog.open && session === openedSession) notify(text().copied);
          } catch {
            if (dialog.open && session === openedSession) notify(text().copyFailed);
          } finally { copy.disabled = false; }
        });
        const download = document.createElement("button");
        download.type = "button";
        download.textContent = text().download;
        download.dataset.qaAction = "download";
        download.addEventListener("click", () => {
          try {
            downloadText(file.code.isConnected ? file.code.textContent : file.text, file.filename, "text/plain;charset=utf-8");
            notify(text().saved);
          } catch { notify(text().saveFailed); }
        });
        controls.append(copy, download);
        card.append(title, meta, preview, controls);
        fragment.append(card);
      });
      fileResults.replaceChildren(fragment);
      status.textContent = files.length ? text().fileCount(Math.min(files.length, RESULT_LIMIT), files.length) : query ? text().emptyFiles : text().noFiles;
    }

    function renderSearch() {
      clearTimeout(searchTimer);
      if (!dialog.open) return;
      const focusedKey = document.activeElement?.closest("[data-qa-key]")?.dataset.qaKey;
      const focusedAction = document.activeElement?.dataset.qaAction;
      const query = search.value.trim().toLowerCase();
      const entries = index.messages();
      root.querySelector('[data-count="messages"]').textContent = entries.length;
      root.querySelector('[data-count="files"]').textContent = entries.reduce((count, entry) => count + entry.files.length, 0);
      if (activeTab === "files") {
        renderFiles(entries, query);
        restoreResultFocus(focusedKey, focusedAction);
        return;
      }
      const matches = entries.filter((entry) => entry.searchable.includes(query));
      root.querySelector(".bds-qa-export > span").textContent = text().saveMessages(matches.length);
      root.querySelectorAll("[data-export]").forEach((button) => { button.disabled = !matches.length; });
      results.replaceChildren();
      actions.hidden = Boolean(query);
      if (!query) {
        renderActions();
        status.textContent = messages().length ? "" : text().noMessages;
        return;
      }

      let total = 0;
      const fragment = document.createDocumentFragment();
      entries.forEach((entry, position) => {
        const { content, node: message } = entry;
        const match = entry.searchable.indexOf(query);
        if (match < 0) return;
        total++;
        if (total > RESULT_LIMIT) return;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "bds-qa-result";
        button.dataset.qaKey = entry.id;
        const label = document.createElement("span");
        label.className = "bds-qa-result-label";
        label.textContent = `${text().message} ${position + 1}`;
        const excerpt = document.createElement("span");
        excerpt.className = "bds-qa-excerpt";
        excerpt.dir = "auto";
        const start = Math.max(0, match - 55);
        const end = Math.min(content.length, match + query.length + 100);
        const mark = document.createElement("mark");
        mark.textContent = content.slice(match, match + query.length);
        excerpt.append(
          (start ? "…" : "") + content.slice(start, match), mark,
          content.slice(match + query.length, end) + (end < content.length ? "…" : ""),
        );
        button.append(label, excerpt);
        button.addEventListener("click", () => runAction(() => visitMessage(message)));
        fragment.append(button);
      });
      results.append(fragment);
      status.textContent = total ? text().count(Math.min(total, RESULT_LIMIT), total) : text().empty;
      restoreResultFocus(focusedKey, focusedAction);
    }

    function restoreResultFocus(key, action) {
      if (!key) return;
      const result = Array.from(root.querySelectorAll("[data-qa-key]")).find((node) => node.dataset.qaKey === key);
      (action ? result?.querySelector(`[data-qa-action="${action}"]`) || search : result || search).focus();
    }

    function selectTab(name, focus = false) {
      if (name === activeTab) return;
      queries[activeTab] = search.value;
      activeTab = name;
      root.querySelectorAll("[data-tab]").forEach((tab) => {
        const selected = tab.dataset.tab === name;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        if (selected && focus) tab.focus();
      });
      root.querySelector("#bds-qa-messages-panel").hidden = name !== "messages";
      root.querySelector("#bds-qa-files-panel").hidden = name !== "files";
      search.value = queries[name];
      clearTimeout(feedbackTimer);
      feedback.textContent = "";
      search.placeholder = name === "files" ? text().searchFiles : text().search;
      search.setAttribute("aria-label", search.placeholder);
      renderSearch();
    }

    function updateLocale(value) {
      locale = value || navigator.language || "en";
      const language = /^ar(?:-|$)/i.test(locale) ? "ar" : "en";
      if (root.lang === language) return;
      const focusedActionIndex = Array.from(actions.children).indexOf(document.activeElement);
      root.lang = language;
      root.dir = root.lang === "ar" ? "rtl" : "ltr";
      root.querySelectorAll("[data-copy]").forEach((node) => {
        node.textContent = text()[node.dataset.copy];
      });
      launcher.setAttribute("aria-label", text().open);
      launcher.title = `${text().open} (Ctrl/⌘ + Shift + K)`;
      closeButton.setAttribute("aria-label", text().close);
      search.placeholder = activeTab === "files" ? text().searchFiles : text().search;
      search.setAttribute("aria-label", search.placeholder);
      root.querySelectorAll("[data-export]").forEach((button) => button.setAttribute("aria-label", text()[button.dataset.export]));
      actions.replaceChildren();
      root.querySelector("kbd").textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ ⇧ K" : "Ctrl Shift K";
      renderSearch();
      if (focusedActionIndex >= 0 && activeTab === "messages" && !search.value.trim()) actions.children[focusedActionIndex]?.focus();
    }

    function open() {
      if (dialog.open) return;
      // Respect other modal workflows rather than opening on top of them.
      if (Array.from(document.querySelectorAll('dialog[open], [aria-modal="true"]')).some(isVisible)) return;
      previousFocus = document.activeElement;
      session++;
      index.clear();
      dialog.showModal();
      launcher.setAttribute("aria-expanded", "true");
      renderSearch();
      search.focus();
      // Only observe while open; skip our own result rendering to prevent loops.
      observer = new MutationObserver((records) => {
        const changes = records.filter((record) => !root.contains(record.target));
        const relevant = index.invalidate(changes) || changes.some((record) =>
          [...record.addedNodes, ...record.removedNodes].some((node) =>
            node.nodeType === Node.ELEMENT_NODE && (node.matches("#bds-toggle, #chat-input") || node.querySelector("#bds-toggle, #chat-input"))),
        );
        if (!relevant || refreshTimer) return;
        refreshTimer = setTimeout(() => {
          refreshTimer = null;
          renderSearch();
        }, 150);
      });
      observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    }

    launcher.setAttribute("aria-expanded", "false");
    launcher.addEventListener("click", open);
    closeButton.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    dialog.addEventListener("close", () => {
      observer?.disconnect();
      observer = null;
      clearTimeout(searchTimer);
      clearTimeout(refreshTimer);
      refreshTimer = null;
      search.value = "";
      queries.messages = "";
      queries.files = "";
      results.replaceChildren();
      fileResults.replaceChildren();
      index.clear();
      clearTimeout(feedbackTimer);
      feedback.textContent = "";
      launcher.setAttribute("aria-expanded", "false");
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    });
    search.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderSearch, 120);
    });
    root.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click", () => saveMessages(button.dataset.export)));
    root.querySelectorAll("[data-tab]").forEach((tab) => {
      tab.addEventListener("click", () => selectTab(tab.dataset.tab));
      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const next = event.key === "Home" ? "messages" : event.key === "End" ? "files" : activeTab === "messages" ? "files" : "messages";
        selectTab(next, true);
      });
    });
    dialog.addEventListener("keydown", (event) => {
      event.stopPropagation();
      // Native search inputs can consume Escape to clear their text instead of
      // closing a dialog. Keep the advertised close action consistent.
      if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        dialog.close();
        return;
      }
      if (event.key === "Tab") {
        const focusable = Array.from(dialog.querySelectorAll('button:not(:disabled):not([tabindex="-1"]), input')).filter(isVisible);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
        return;
      }
      if (!["ArrowDown", "ArrowUp"].includes(event.key) || event.isComposing) return;
      const buttons = Array.from(root.querySelectorAll(".bds-qa-actions button:not(:disabled), .bds-qa-result, .bds-qa-file button")).filter(isVisible);
      if (!buttons.length) return;
      event.preventDefault();
      const index = buttons.indexOf(document.activeElement);
      const next = index < 0 ? (event.key === "ArrowDown" ? 0 : buttons.length - 1) : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
    });
    document.addEventListener("keydown", (event) => {
      if (event.isComposing || event.repeat || event.altKey || !(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      event.stopPropagation();
      if (dialog.open) dialog.close();
      else open();
    }, true);

    updateLocale(locale);
    try {
      chrome.storage.local.get("bds_settings").then((data) => updateLocale(data.bds_settings?.locale)).catch(() => {});
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.bds_settings) updateLocale(changes.bds_settings.newValue?.locale);
      });
    } catch { /* Browser language remains usable if extension storage is unavailable. */ }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
