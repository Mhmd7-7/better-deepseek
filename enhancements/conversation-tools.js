/* Shared, local-only conversation indexing and file helpers. */
(() => {
  "use strict";
  const EXTENSIONS = {
    javascript: "js", js: "js", typescript: "ts", ts: "ts", python: "py", py: "py",
    html: "html", css: "css", json: "json", bash: "sh", shell: "sh", sh: "sh",
    markdown: "md", md: "md", yaml: "yml", yml: "yml", sql: "sql", xml: "xml",
    java: "java", kotlin: "kt", rust: "rs", go: "go", cpp: "cpp", c: "c", ruby: "rb",
  };

  function safeFilename(value, fallback) {
    const name = String(value || "").split(/[\\/]/).at(-1)
      .replace(/[<>:"|?*\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "_")
      .replace(/^[.\s]+|[.\s]+$/g, "").slice(0, 100);
    if (!name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) return fallback;
    return name;
  }

  // Search-only folding. Keep the original message/code text for display and exports.
  function messageSearchText(value, offsets = false) {
    let text = "", position = 0, foldMarks = false;
    const starts = [], ends = [];
    for (const original of String(value)) {
      const end = position + original.length;
      for (let character of original.normalize("NFKD").toLowerCase()) {
        const mark = /\p{M}/u.test(character);
        if (/[\u0640\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(character)
          || (mark && (foldMarks || /\p{Script_Extensions=Arabic}/u.test(character)))) {
          if (offsets && ends.length) ends[ends.length - 1] = end;
          continue;
        }
        if (!mark) foldMarks = /[\p{Script=Latin}\p{Script=Arabic}]/u.test(character);
        // Alef wasla does not decompose like أ / إ / آ.
        if (character === "\u0671") character = "ا";
        text += character;
        if (offsets) for (let i = 0; i < character.length; i++) {
          starts.push(position);
          ends.push(end);
        }
      }
      position = end;
    }
    return { text, starts, ends };
  }

  function normalizeMessageText(value) {
    return messageSearchText(value).text;
  }

  function searchMessages(entries, query, role = "all") {
    const terms = [...new Set(normalizeMessageText(query).trim().split(/\s+/u).filter(Boolean))];
    const counts = { all: 0, user: 0, assistant: 0 };
    const matches = [];
    for (const entry of entries) {
      if (!terms.every((term) => entry.searchable.includes(term))) continue;
      counts.all++;
      if (entry.role === "user" || entry.role === "assistant") counts[entry.role]++;
      if (role === "all" || entry.role === role) matches.push(entry);
    }
    return { terms, counts, matches };
  }

  function messageExcerpt(value, terms) {
    const content = String(value);
    const { text, starts, ends } = messageSearchText(content, true);
    let first = -1, firstLength = 0;
    for (const term of terms) {
      if (!term) continue;
      const at = text.indexOf(term);
      if (at >= 0 && (first < 0 || at < first)) { first = at; firstLength = term.length; }
    }
    let start = first < 0 ? 0 : Math.max(0, starts[first] - 55);
    let end = first < 0 ? Math.min(content.length, 160) : Math.min(content.length, ends[first + firstLength - 1] + 100);
    // Context boundaries must not split surrogate pairs or combining accents.
    while (start > 0 && /[\uDC00-\uDFFF]|\p{M}/u.test(content[start])) start--;
    if (end < content.length && /[\uD800-\uDBFF]/u.test(content[end - 1])) end++;
    while (end < content.length && /\p{M}/u.test(content[end])) end++;
    const ranges = [];
    for (const term of terms) {
      if (!term) continue;
      let at = text.indexOf(term, first < 0 ? 0 : first);
      while (at >= 0 && starts[at] < end) {
        ranges.push({ start: Math.max(start, starts[at]), end: Math.min(end, ends[at + term.length - 1]) });
        at = text.indexOf(term, at + 1);
      }
    }
    ranges.sort((a, b) => a.start - b.start || a.end - b.end);
    const merged = [];
    for (const range of ranges) {
      const last = merged.at(-1);
      if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
      else merged.push({ ...range });
    }
    const parts = [];
    let cursor = start;
    if (start) parts.push({ text: "…", match: false });
    for (const range of merged) {
      if (range.start > cursor) parts.push({ text: content.slice(cursor, range.start), match: false });
      parts.push({ text: content.slice(range.start, range.end), match: true });
      cursor = range.end;
    }
    if (cursor < end) parts.push({ text: content.slice(cursor, end), match: false });
    if (end < content.length) parts.push({ text: "…", match: false });
    return parts;
  }

  function readMessage(node, id) {
    const bodies = Array.from(node.querySelectorAll(".ds-markdown"))
      .filter((body) => !body.parentElement.closest(".ds-markdown"));
    const text = (bodies.length ? bodies : [node])
      .map((body) => body.innerText || body.textContent || "").join("\n\n").trim();
    const content = text.replace(/\s+/g, " ");
    const roleHint = node.dataset.messageRole || node.dataset.role;
    const role = ["user", "assistant"].includes(roleHint) ? roleHint
      : node.matches(".d29f3d7d, ._9663006, .ds-message--user") ? "user"
      : node.matches("._4f9bf79, .ds-message--assistant") ? "assistant" : "message";
    const files = Array.from(node.querySelectorAll("pre code")).map((code, index) => {
      const wrapper = code.closest("pre");
      const language = String(code.dataset.language || wrapper.dataset.language
        || code.className.match(/(?:^|\s)language-([\w+-]+)/)?.[1] || "text").toLowerCase().slice(0, 40);
      const filename = safeFilename(code.dataset.filename || wrapper.dataset.filename,
        `code-${id}-${index + 1}.${EXTENSIONS[language] || "txt"}`);
      const text = code.textContent || "";
      return { id: `${id}-code-${index}`, node, code, language, filename, text, size: new TextEncoder().encode(text).length,
        searchable: `${filename}\n${language}\n${text}`.toLowerCase() };
    });
    return { id: String(id), node, role, text, content, searchable: normalizeMessageText(content), files };
  }

  class ConversationIndex {
    constructor() {
      this.entries = new Map();
      this.dirty = new Set();
      this.membershipDirty = true;
      this.nextId = 1;
    }

    invalidate(records) {
      let relevant = false;
      for (const record of records) {
        const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
        const message = target?.closest(".ds-message");
        if (message) { this.dirty.add(message); relevant = true; }
        for (const node of [...record.addedNodes, ...record.removedNodes]) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.matches(".ds-message") || node.querySelector(".ds-message")) {
            this.membershipDirty = true;
            relevant = true;
          }
        }
      }
      return relevant;
    }

    messages() {
      if (this.membershipDirty) {
        const next = new Map();
        document.querySelectorAll(".ds-message").forEach((node) => {
          let entry = this.entries.get(node);
          if (!entry || this.dirty.has(node)) entry = readMessage(node, entry?.id || this.nextId++);
          next.set(node, entry);
        });
        this.entries = next;
      } else {
        for (const node of this.dirty) {
          const entry = this.entries.get(node);
          if (entry) this.entries.set(node, readMessage(node, entry.id));
        }
      }
      this.membershipDirty = false;
      this.dirty.clear();
      return Array.from(this.entries.values());
    }

    clear() {
      this.entries.clear();
      this.dirty.clear();
      this.membershipDirty = true;
      this.nextId = 1;
    }
  }

  function downloadText(text, filename, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function serializeMessages(entries, format, title, labels) {
    if (format === "json") return JSON.stringify({
      version: 1, title, url: location.href, exportedAt: new Date().toISOString(),
      messages: entries.map(({ role, text }) => ({ role, text })),
    }, null, 2);
    return `# ${title.replace(/\s+/g, " ")}\n\n` + entries.map(({ role, text }) =>
      `## ${labels[role]}\n\n${text}`,
    ).join("\n\n---\n\n") + "\n";
  }

  globalThis.BDSQuickAccessTools = Object.freeze({
    ConversationIndex, downloadText, serializeMessages, normalizeMessageText, searchMessages, messageExcerpt,
  });
})();
