/* Quick navigation for the packaged Chrome extension. No build step required. */
(() => {
  "use strict";

  const ROOT_ID = "bds-quick-access";
  const RESULT_LIMIT = 50;
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
        <div class="bds-qa-search-wrap">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
          <input class="bds-qa-search" type="search" autocomplete="off" spellcheck="false" maxlength="200" aria-describedby="bds-qa-hint" autofocus>
        </div>
        <p id="bds-qa-hint" data-copy="hint"></p>
        <div class="bds-qa-actions"></div>
        <p class="bds-qa-status" role="status" aria-live="polite" aria-atomic="true"></p>
        <div class="bds-qa-results"></div>
        <footer><span data-copy="keyboard"></span><kbd dir="ltr"></kbd></footer>
      </dialog>`;
    document.body.append(root);

    const dialog = root.querySelector("dialog");
    const launcher = root.querySelector(".bds-qa-launcher");
    const search = root.querySelector("input");
    const actions = root.querySelector(".bds-qa-actions");
    const results = root.querySelector(".bds-qa-results");
    const status = root.querySelector(".bds-qa-status");
    const closeButton = root.querySelector(".bds-qa-close");
    const text = () => COPY[/^ar(?:-|$)/i.test(locale) ? "ar" : "en"];
    const messages = () => Array.from(document.querySelectorAll(".ds-message"));
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
      actions.replaceChildren(
        createAction(t.compose, "compose", !!composer(), () => composer()?.focus()),
        createAction(t.settings, "settings", isVisible(toggle), () => toggle.click()),
        createAction(t.first, "first", items.length > 0, () => visitMessage(messages()[0])),
        createAction(t.last, "last", items.length > 0, () => visitMessage(messages().at(-1))),
      );
    }

    function renderSearch() {
      clearTimeout(searchTimer);
      if (!dialog.open) return;
      const focusedIndex = Array.from(results.children).indexOf(document.activeElement);
      const focusedActionIndex = Array.from(actions.children).indexOf(document.activeElement);
      const query = search.value.trim().toLocaleLowerCase();
      results.replaceChildren();
      actions.hidden = Boolean(query);
      if (!query) {
        renderActions();
        status.textContent = messages().length ? "" : text().noMessages;
        if (focusedActionIndex >= 0) {
          const button = actions.children[focusedActionIndex];
          (button && !button.disabled ? button : search).focus();
        }
        return;
      }

      let total = 0;
      const fragment = document.createDocumentFragment();
      messages().forEach((message, index) => {
        const body = message.querySelector(".ds-markdown") || message;
        const content = (body.innerText || body.textContent || "").replace(/\s+/g, " ").trim();
        const match = content.toLocaleLowerCase().indexOf(query);
        if (match < 0) return;
        total++;
        if (total > RESULT_LIMIT) return;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "bds-qa-result";
        const label = document.createElement("span");
        label.className = "bds-qa-result-label";
        label.textContent = `${text().message} ${index + 1}`;
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
      if (focusedIndex >= 0) (results.children[Math.min(focusedIndex, results.children.length - 1)] || search).focus();
    }

    function updateLocale(value) {
      locale = value || navigator.language || "en";
      root.lang = /^ar(?:-|$)/i.test(locale) ? "ar" : "en";
      root.dir = root.lang === "ar" ? "rtl" : "ltr";
      root.querySelectorAll("[data-copy]").forEach((node) => {
        node.textContent = text()[node.dataset.copy];
      });
      launcher.setAttribute("aria-label", text().open);
      launcher.title = `${text().open} (Ctrl/⌘ + Shift + K)`;
      closeButton.setAttribute("aria-label", text().close);
      search.placeholder = text().search;
      search.setAttribute("aria-label", text().search);
      root.querySelector("kbd").textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ ⇧ K" : "Ctrl Shift K";
      renderSearch();
    }

    function open() {
      if (dialog.open) return;
      // Respect other modal workflows rather than opening on top of them.
      if (Array.from(document.querySelectorAll('dialog[open], [aria-modal="true"]')).some(isVisible)) return;
      previousFocus = document.activeElement;
      dialog.showModal();
      launcher.setAttribute("aria-expanded", "true");
      renderSearch();
      search.focus();
      // Only observe while open; skip our own result rendering to prevent loops.
      observer = new MutationObserver((records) => {
        const relevant = records.some((record) => {
          if (root.contains(record.target)) return false;
          const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
          if (target?.closest(".ds-message")) return true;
          return [...record.addedNodes, ...record.removedNodes].some((node) =>
            node.nodeType === Node.ELEMENT_NODE && (node.matches(".ds-message, #bds-toggle, #chat-input") || node.querySelector(".ds-message, #bds-toggle, #chat-input")),
          );
        });
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
      results.replaceChildren();
      launcher.setAttribute("aria-expanded", "false");
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    });
    search.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderSearch, 120);
    });
    dialog.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Tab") {
        const focusable = Array.from(dialog.querySelectorAll("button:not(:disabled), input")).filter(isVisible);
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
      const buttons = Array.from(root.querySelectorAll(".bds-qa-actions:not([hidden]) button:not(:disabled), .bds-qa-result"));
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
