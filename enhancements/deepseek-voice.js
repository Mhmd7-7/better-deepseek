/* Live native Read aloud controller. No audio generation, private TTS API,
 * voice selection or decoding. The only playback request is the page's own
 * per-response Read aloud control. See docs/NATIVE-LIVE-READ-ALOUD.md for the
 * observed evidence and deliberately conservative runtime limitations.
 */
(() => {
  "use strict";
  const KEY = "bds_settings", GENERATION = "bds:native-generation", ARM = "bds:native-live-turn";
  const PLAYBACK = "bds:native-playback", PLAYBACK_ARM = "bds:native-playback-arm";
  const ROW = "[data-virtual-list-item-key]";
  const CONTENT = ".ds-assistant-message-main-content, [data-message-author-role='assistant'], .ds-message[data-role='assistant']";
  const READ = '[role="button"][aria-label="Read aloud" i], button[aria-label="Read aloud" i]';
  const STREAM = ".ds-cursor, ._streaming, [aria-busy='true']";
  // Deadlines report unavailability. They NEVER prove generation/playback ended.
  const CONTROL_DEADLINE = 15000, START_DEADLINE = 6000, GENERATION_DEADLINE = 120000, UI_STABLE = 600;
  const listeners = new Set(), unsupported = new Set();
  let settings = {}, live = null, playback = null, ui = null, disposed = false, serial = 0;
  let status = { code: "idle", message: "" };
  const clean = (value) => typeof value === "string" || typeof value === "number" ? String(value) : "";
  const conversation = () => clean(location.href).match(/\/chat\/s\/([^/?#]+)/)?.[1] || "";
  const arabic = () => /^ar\b/i.test(document.documentElement?.lang || globalThis.navigator?.language || "");
  const text = (en, ar) => arabic() ? ar : en;
  const fault = (code) => Object.assign(new Error(code), { code });
  const storage = () => { try { return globalThis.chrome?.storage?.local; } catch { return null; } };
  function emit(name, detail) { window.dispatchEvent(new CustomEvent(name, { detail: JSON.stringify(detail) })); }
  function detailOf(event) { try { return typeof event.detail === "string" ? JSON.parse(event.detail) : event.detail; } catch { return null; } }
  function notify() {
    for (const fn of listeners) { try { fn({ autoRead: enabled(), status: { ...status } }); } catch {} }
    render();
  }
  function setStatus(code, message) {
    if (status.code === code && status.message === message) return;
    status = { code, message };
    // Surface failures outside the panel; the user cannot otherwise tell why
    // automatic native audio did not start.
    if (["missing", "disabled", "ambiguous", "identity-unverified", "completion-unverified", "audio-failed", "stop-unverified", "language-unsupported", "quota", "rate"].includes(code)) {
      emit("bds:native-read-status", { code, message, conversation: live?.conversation || null });
    }
    notify();
  }
  function enabled() { return settings.liveNativeAutoRead === true; }
  const ready = Promise.resolve().then(async () => {
    try {
      const stored = await storage()?.get(KEY);
      settings = { ...(stored?.[KEY] || {}) };
      // A new Live-only preference. Never enable global reading of historical
      // or ordinary text-chat replies, and never overwrite a saved user choice.
      if (typeof settings.liveNativeAutoRead !== "boolean") {
        settings.liveNativeAutoRead = true;
        await storage()?.set({ [KEY]: settings });
      }
    } catch { settings = { ...settings, liveNativeAutoRead: false }; }
    notify();
  });
  const onSettings = (changes, area) => {
    if (area !== "local" || !changes?.[KEY]) return;
    settings = { ...(changes[KEY].newValue || {}) };
    if (!enabled()) stopPlayback("setting-disabled");
    notify();
  };
  try { chrome.storage.onChanged.addListener(onSettings); } catch {}
  async function setAutoRead(value) {
    await ready;
    const before = settings;
    try {
      const stored = await storage()?.get(KEY);
      settings = { ...(stored?.[KEY] || settings), liveNativeAutoRead: value === true };
      await storage()?.set({ [KEY]: settings });
      if (!enabled()) stopPlayback("setting-disabled");
      notify();
    } catch { settings = before; notify(); throw fault("storage"); }
  }
  function current(session) {
    return Boolean(session && !disposed && session === live && !session.closed && session.options.isCurrent() &&
      (!session.conversation || !conversation() || session.conversation === conversation()));
  }
  function followConversation() {
    if (!live || live.closed) return false;
    const now = conversation();
    if (!now) return true;
    if (!live.conversation) { live.conversation = now; return true; }
    return live.conversation === now;
  }
  function rows() { return Array.from(document.querySelectorAll(ROW)); }
  function keyOf(row) { return row?.getAttribute("data-virtual-list-item-key") || ""; }
  function assistant(row) {
    const found = Array.from(row.querySelectorAll(CONTENT)).filter((node) => node.closest(ROW) === row);
    // Prefer the site's content container when nested assistant wrappers exist.
    const native = found.filter((node) => node.matches(".ds-assistant-message-main-content"));
    const list = native.length ? native : found.filter((node) => !found.some((other) => other !== node && other.contains(node)));
    return list.length === 1 ? list[0] : null;
  }
  function streaming(row) {
    return row.matches("._streaming, [aria-busy='true']") || Boolean(row.querySelector(STREAM));
  }
  function locate(turn) {
    if (!turn?.rowKey) return { code: "identity-unverified" };
    const matches = rows().filter((row) => keyOf(row) === turn.rowKey);
    if (matches.length !== 1) return { code: matches.length ? "ambiguous" : "missing" };
    const row = matches[0], content = assistant(row);
    if (!content) return { code: "ambiguous" };
    if (streaming(row)) return { code: "awaiting-completion", row, content };
    // Toolbar may be a sibling of content. Never search the whole conversation,
    // use a random BDS bookmark id, or click controls embedded in answer markup.
    // Toolbar may be a sibling of content (often under its immediate wrapper),
    // so search the shared wrapper first, then the bounded virtualized row.
    let buttons = [];
    for (const container of [content.parentElement, row]) {
      if (!container) continue;
      buttons = Array.from(container.querySelectorAll(READ)).filter((button) => {
        const owner = button.closest(ROW);
        return (container === row ? owner === row : !owner || owner === row) && !content.contains(button) &&
          !button.closest("pre, code, .ds-markdown, .bds-host-wrapper, #bds-root, #bds-voice-panel");
      });
      if (buttons.length) break;
    }
    if (buttons.length !== 1) return { code: buttons.length ? "ambiguous" : "missing", row, content };
    const button = buttons[0];
    const disabled = button.disabled || button.getAttribute("aria-disabled") === "true" || button.closest("[inert]");
    // The site may reveal its toolbar only on hover. A connected, enabled deepseek
    // control is still activatable programmatically; do not demand layout geometry.
    const available = button.isConnected && !button.closest("[hidden], [aria-hidden='true']");
    return { code: disabled ? "disabled" : available ? "ready" : "missing", row, content, button };
  }
  function inspect() {
    if (!live?.turn) return { code: "idle", message: text("No current Live reply. Historical messages are never auto-read.", "لا يوجد رد Live حالي. لا تُقرأ الرسائل القديمة تلقائيًا.") };
    if (!live.turn.completed) return { code: "awaiting-completion", message: text("Waiting for verified generation completion.", "بانتظار تأكيد اكتمال التوليد.") };
    const value = locate(live.turn);
    return { code: value.code, message: status.message };
  }
  function reportUnavailable(code) {
    const messages = {
      missing: text("Native Read aloud is not available for this reply/account, or its row is not mounted. No voice fallback.", "زر القراءة الأصلي غير متاح لهذا الرد/الحساب، أو صف الرسالة غير محمّل. لا صوت بديل."),
      disabled: text("DeepSeek's Read aloud control is disabled for this reply. No repeated clicks.", "زر القراءة الأصلي معطّل لهذا الرد. لن نكرر الضغط عليه."),
      ambiguous: text("Cannot safely identify this reply's native toolbar. Use the site's Read aloud manually.", "تعذّر تحديد شريط هذا الرد بأمان. استخدم زر القراءة في الموقع يدويًا."),
      "identity-unverified": text("No uniquely observed streaming row for this Live response. Automatic Read aloud was skipped.", "لم يُرصد صف بثّ فريد لهذا الرد. تم تجاوز القراءة التلقائية."),
    };
    setStatus(code, messages[code] || messages.missing);
  }
  function bindStreaming(session, turn) {
    if (turn.rowKey || !turn.requestId || !current(session)) return 0;
    // Prefer a unique streaming row, but fall back to a unique *new* assistant
    // row relative to the pre-send baseline. This handles fast replies whose
    // cursor class disappears before a mutation is observed.
    const fresh = rows().filter((row) => assistant(row) &&
      (!turn.baseline.has(keyOf(row)) || keyOf(row) === turn.regeneratedKey) &&
      (!turn.regeneratedKey || keyOf(row) === turn.regeneratedKey || turn.baseline.size === 0));
    const streamingRows = fresh.filter(streaming);
    const candidates = streamingRows.length ? streamingRows : fresh;
    turn.freshRows = candidates.length;
    if (candidates.length !== 1 || !keyOf(candidates[0])) return candidates.length;
    // This key was observed on the unique new Live row during the correlated
    // request. Its value is opaque: equality to a server id is NOT assumed.
    turn.rowKey = keyOf(candidates[0]);
    return 1;
  }
  function watch(session) {
    if (session.observer) return;
    session.observer = new MutationObserver((records) => {
      if (records.every((record) => ui?.contains(record.target))) return;
      const turn = session.turn;
      if (!current(session) || !turn || turn.cancelled) return;
      bindStreaming(session, turn);
      if (turn.completed) tryRead(session, turn);
      else maybeUiComplete(session, turn);
    });
    session.observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true,
      attributeFilter: ["data-virtual-list-item-key", "aria-disabled", "disabled", "aria-busy", "class", "aria-label", "hidden", "aria-hidden"] });
  }
  function clearTurnTimers(turn) {
    if (!turn) return;
    clearTimeout(turn.generationTimer); clearTimeout(turn.controlTimer); clearTimeout(turn.uiTimer);
  }
  function cancelTurn(session, reason) {
    const turn = session?.turn;
    if (turn && !turn.cancelled) {
      turn.cancelled = true; clearTurnTimers(turn);
      emit(ARM, { turnId: turn.id, cancel: true });
      generationEnd(session, "cancelled");
    }
    session?.observer?.disconnect();
    if (session) session.observer = null;
    // A stale session handle must never pause/release the current Live player.
    if (session !== live) return { safe: true, stale: true };
    return stopPlayback(reason);
  }
  function generationEnd(session, phase) {
    if (current(session)) session.options.onGenerationEnd?.({ phase });
  }
  function beginTurn(session, { turnId, prompt }) {
    if (!current(session)) return null;
    cancelTurn(session, "new-turn");
    const turn = { id: clean(turnId), baseline: new Set(rows().map(keyOf)), requestId: "", rowKey: "",
      completed: false, cancelled: false, attempted: false, serverId: "" };
    session.turn = turn;
    if (!turn.id) {
      reportUnavailable("identity-unverified"); generationEnd(session, "unavailable"); return null;
    }
    // New chats have no /chat/s/<id> at send time; the request event supplies
    // the captured session and the controller adopts it when it arrives.
    emit(ARM, { turnId: turn.id, sessionId: session.conversation, prompt: clean(prompt) });
    watch(session);
    setStatus("awaiting-completion", text("Waiting for this Live turn's completed response.", "بانتظار اكتمال رد دور Live الحالي."));
    turn.generationTimer = setTimeout(() => {
      if (!current(session) || turn !== session.turn || turn.completed || turn.cancelled) return;
      turn.cancelled = true; emit(ARM, { turnId: turn.id, cancel: true }); session.observer?.disconnect();
      setStatus("completion-unverified", text("Generation completion could not be verified. No automatic playback; use native Read aloud manually.", "تعذّر التحقق من اكتمال التوليد. استخدم زر القراءة الأصلي يدويًا."));
      generationEnd(session, "unavailable");
    }, GENERATION_DEADLINE);
    return { cancel: () => { if (live === session && session.turn === turn) cancelTurn(session, "turn-cancelled"); } };
  }
  function onGeneration(event) {
    const data = detailOf(event), session = live;
    if (!data || !current(session)) return;
    // A brand-new chat has no /chat/s/<id> when the turn is armed: adopt the
    // session captured from the real request body, never a guessed one.
    if (!session.conversation && data.sessionId) session.conversation = data.sessionId;
    if (data.sessionId && session.conversation && data.sessionId !== session.conversation) return;
    let turn = session.turn;
    if (!turn || turn.cancelled) return;
    if (data.phase === "start") {
      const original = data.liveTurnId === turn.id;
      const regeneration = data.kind === "edit_message" && turn.completed && turn.serverId && data.requestMessageId === turn.serverId;
      if (!original && !regeneration) return;
      if (regeneration) {
        const previous = turn;
        cancelTurn(session, "regenerated");
        turn = { id: previous.id, baseline: new Set(rows().map(keyOf)), regeneratedKey: previous.rowKey,
          requestId: "", rowKey: "", serverId: "", completed: false, attempted: false, cancelled: false };
        session.turn = turn; watch(session);
        session.options.onGenerationStart?.();
        turn.generationTimer = setTimeout(() => {
          if (!current(session) || session.turn !== turn || turn.completed || turn.cancelled) return;
          turn.cancelled = true; session.observer?.disconnect();
          setStatus("completion-unverified", text("Regeneration completion could not be verified. No automatic playback.", "تعذّر التحقق من اكتمال إعادة التوليد. لا تشغيل تلقائي."));
          generationEnd(session, "unavailable");
        }, GENERATION_DEADLINE);
      }
      if (turn.requestId && turn.requestId !== data.requestId) return;
      turn.requestId = clean(data.requestId); turn.version = clean(data.version) || turn.requestId;
      bindStreaming(session, turn);
      return;
    }
    if (!turn.requestId || turn.requestId !== data.requestId) return;
    if (data.phase !== "completed") {
      if (!["error", "cancelled"].includes(data.phase)) return;
      clearTurnTimers(turn); turn.cancelled = true; session.observer?.disconnect();
      setStatus("completion-unverified", text("Response stopped or completion was not verifiable. No automatic audio was requested.", "توقف الرد أو تعذّر إثبات اكتماله. لم تُطلب قراءة تلقائية."));
      generationEnd(session, data.phase); return;
    }
    bindStreaming(session, turn);
    clearTimeout(turn.generationTimer);
    turn.completed = true; turn.terminal = data.terminal || "unknown"; turn.serverId = clean(data.messageId);
    try { console.info("[BDS native-read] response completed", { turn: turn.id, requestId: turn.requestId, terminal: turn.terminal, rowKey: turn.rowKey }); } catch {}
    generationEnd(session, "completed");
    if (!enabled()) {
      turn.attempted = true; session.observer?.disconnect(); session.observer = null;
      setStatus("disabled", text("Live native auto-read is off. This reply will not be replayed when enabled later.", "القراءة الأصلية التلقائية لـ Live متوقفة. لن يُعاد هذا الرد عند تفعيلها لاحقًا.")); return;
    }
    if (!turn.rowKey && turn.freshRows > 1) {
      // Multiple new rows exist: identity is genuinely ambiguous, do not guess.
      turn.cancelled = true; session.observer?.disconnect(); reportUnavailable("ambiguous"); return;
    }
    if (!turn.rowKey && turn.freshRows === 1) {
      // One new row exists but the virtualized key is absent: cannot survive
      // rerenders, so fail closed instead of position/text matching.
      turn.cancelled = true; session.observer?.disconnect(); reportUnavailable("identity-unverified"); return;
    }
    // Row/control availability is the final gate. Wait for the DOM (virtualized
    // reinsertion, delayed toolbar); never give up because binding was late.
    turn.controlTimer = setTimeout(() => {
      if (!current(session) || session.turn !== turn || turn.attempted || turn.cancelled) return;
      // Expiry is a failure notification, not a completion detector or retry.
      turn.cancelled = true; session.observer?.disconnect(); reportUnavailable(locate(turn).code);
    }, CONTROL_DEADLINE);
    tryRead(session, turn);
  }
  // The native toolbar is the page's own completion signal. If the protocol
  // bridge never reports a terminal marker, accept a *ready native control*
  // that stays stable after the request started and streaming indicators are
  // gone. This is DOM completion evidence, never text inactivity alone.
  function maybeUiComplete(session, turn) {
    if (!turn.requestId || turn.completed || turn.cancelled || !enabled() || turn.uiTimer) return;
    const found = locate(turn);
    if (found.code !== "ready" && found.code !== "disabled") return;
    turn.uiTimer = setTimeout(() => {
      if (!current(session) || session.turn !== turn || turn.completed || turn.cancelled) return;
      const checked = locate(turn);
      if (checked.code !== "ready" && checked.code !== "disabled") return;
      turn.completed = true; turn.terminal = "ui";
      try { console.info("[BDS native-read] completion accepted from stable native toolbar"); } catch {}
      generationEnd(session, "completed");
      turn.controlTimer = setTimeout(() => {
        if (!current(session) || session.turn !== turn || turn.attempted || turn.cancelled) return;
        turn.cancelled = true; session.observer?.disconnect(); reportUnavailable(locate(turn).code);
      }, CONTROL_DEADLINE);
      tryRead(session, turn);
    }, UI_STABLE);
  }
  function tryRead(session, turn) {
    if (!current(session) || turn !== session.turn || turn.cancelled || !turn.completed || turn.attempted || !enabled()) return;
    const found = locate(turn);
    if (found.code !== "ready") {
      if (found.code === "disabled" || found.code === "ambiguous") reportUnavailable(found.code);
      return;
    }
    if (playback) {
      setStatus("stop-unverified", text("Previous native audio may still be playing. Stop it in DeepSeek, then confirm before the next reply.", "قد يستمر الصوت السابق. أوقفه في DeepSeek ثم أكّد قبل الرد التالي."));
      return;
    }
    // Once DeepSeek says its Read aloud lacks this language, never repeat the
    // failing click for later replies in the same script. No fallback voice.
    const language = replyLanguage(turn);
    if (language && unsupported.has(language)) {
      turn.attempted = true; clearTurnTimers(turn); session.observer?.disconnect(); session.observer = null;
      setStatus("language-unsupported", text("DeepSeek's native Read aloud does not support this reply language yet. Live listening resumes; no replacement voice is used.", "القراءة بصوت DeepSeek غير مدعومة لهذه اللغة بعد. يعود الاستماع ولا يُستخدم صوت بديل."));
      return;
    }
    turn.attempted = true; clearTurnTimers(turn); turn.language = language;
    session.observer?.disconnect(); session.observer = null;
    startPlayback(session, turn, found, true);
  }
  function replyLanguage(turn) {
    const content = locate(turn).content;
    const value = content?.textContent || "";
    const arabic = (value.match(/[\u0600-\u06FF]/g) || []).length;
    const letters = (value.match(/\p{L}/gu) || []).length;
    if (!letters) return "";
    return arabic >= 4 && arabic / letters >= 0.15 ? "ar" : "other";
  }
  // DeepSeek's own toast is the authority on native Read aloud availability.
  function siteAlertCode(value) {
    const message = String(value || "").trim();
    if (!message || message.length > 700) return "";
    if (/read aloud[^.]*?(?:isn['’]?t|is not|not)\s+supported[^.]*language/i.test(message) ||
      /(?:language|locale)[^.]*?not supported[^.]*?(?:read aloud|speech|voice)/i.test(message) ||
      /(?:read aloud|speech|voice)[^.]*?unsupported/i.test(message) ||
      /غير مدعوم(?:ة|ةٌ)?\s*(?:لهذه\s*اللغة|باللغة|للغة)/.test(message) ||
      /(?:القراءة|الصوت)[^.]*?غير\s*مدعوم/.test(message)) return "language-unsupported";
    if (/(?:read aloud|speech)[^.]*?(?:quota|daily limit|limit reached)/i.test(message) ||
      /(?:quota|limit)[^.]*?(?:read aloud|speech)/i.test(message) ||
      /(?:حصة|الحد اليومي)[^.]*?(?:القراءة|الصوت)/.test(message)) return "quota";
    if (/(?:read aloud|speech)[^.]*?(?:too many requests|rate limit|try again later)/i.test(message)) return "rate";
    return "";
  }
  function watchSiteAlerts(player) {
    const scan = (node) => {
      if (playback !== player) return;
      const value = node?.textContent;
      const code = siteAlertCode(value);
      if (!code) return;
      if (code === "language-unsupported") {
        const language = player.turn.language || replyLanguage(player.turn);
        if (language) unsupported.add(language);
      }
      failPlayback(player, code);
    };
    player.toastObserver = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData") { scan(record.target.parentElement); continue; }
        for (const node of record.addedNodes || []) scan(node);
      }
    });
    player.toastObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  function failPlayback(player, code) {
    if (player !== playback) return;
    removeMediaListeners(player); playback = null;
    if (player.turn && player.turn.attempted !== true) player.turn.attempted = true;
    const messages = {
      "language-unsupported": text("DeepSeek's native Read aloud does not support this reply language yet. Listening resumes; no replacement voice is used.", "القراءة بصوت DeepSeek غير مدعومة لهذه اللغة بعد. يعود الاستماع ولا يُستخدم صوت بديل."),
      quota: text("This account's native Read aloud quota is exhausted. Listening resumes; no replacement voice is used.", "انتهت حصة القراءة الأصلية لهذا الحساب. يعود الاستماع ولا يُستخدم صوت بديل."),
      rate: text("DeepSeek is rate-limiting Read aloud. Listening resumes; try later if needed.", "DeepSeek يحدّ طلبات القراءة مؤقتًا. يعود الاستماع ويمكن المحاولة لاحقًا."),
    };
    setStatus(code, messages[code] || messages["language-unsupported"]);
    release(code, true);
  }
  function hold(session) {
    if (current(session)) session.options.onHold?.();
  }
  function release(reason, userConfirmed = false) {
    if (live && current(live)) live.options.onRelease?.({ reason, verified: !userConfirmed, userConfirmed });
  }
  function removeMediaListeners(player) {
    for (const [media, handlers] of player.media) for (const [name, fn] of handlers) media.removeEventListener(name, fn);
    player.media.clear(); player.observer?.disconnect(); player.toastObserver?.disconnect(); clearTimeout(player.startTimer);
  }
  function finishPlayback(player, reason, userConfirmed = false) {
    if (player !== playback) return;
    removeMediaListeners(player); playback = null;
    setStatus(userConfirmed ? "user-confirmed" : "ended", userConfirmed
      ? text("You confirmed native audio has stopped. Listening may resume.", "أكدتَ توقف الصوت الأصلي. يمكن استئناف الاستماع.")
      : text("Native media reported playback ended/stopped.", "أبلغ مشغّل الوسائط الأصلي بانتهاء/إيقاف الصوت."));
    release(reason, userConfirmed);
  }
  function attachMedia(player) {
    const found = locate(player.turn), row = found.row;
    if (!row?.isConnected || keyOf(row) !== player.turn.rowKey || !found.content || found.code === "ambiguous") return;
    const mediaNodes = new Set([...(found.content.parentElement?.querySelectorAll?.("audio, video") || []), ...row.querySelectorAll("audio, video")]);
    for (const media of mediaNodes) {
      const owner = media.closest(ROW);
      if ((owner && owner !== row) || found.content.contains(media) || player.media.has(media) || player.priorMedia.has(media)) continue;
      // Only native toolbar media associated with this exact row is observed.
      // Global/unrelated audio and Web Audio are intentionally NOT attributed.
      const playing = () => {
        if (playback !== player) return;
        player.started = true; player.activeMedia.add(media); clearTimeout(player.startTimer);
        setStatus("playing", text("Native Read aloud is playing. Microphone paused.", "تعمل القراءة الأصلية. الميكروفون معلّق."));
      };
      const ended = () => {
        if (playback !== player || !player.started) return;
        if (!player.ambiguous && player.activeMedia.size && [...player.activeMedia].every((item) => item.ended)) finishPlayback(player, "ended");
      };
      const failed = () => {
        if (playback !== player) return;
        setStatus("audio-failed", text("Native playback failed. Microphone stays paused until you confirm audio has stopped. No fallback voice.", "فشل التشغيل الأصلي. يبقى الميكروفون معلّقًا حتى تؤكد توقف الصوت. لا صوت بديل."));
      };
      const paused = () => {
        if (playback === player && !media.ended) setStatus("paused", text("Native media is paused, not finished. Resume or stop it in DeepSeek, then confirm.", "الصوت متوقف مؤقتًا ولم ينتهِ. استأنفه أو أوقفه في DeepSeek ثم أكّد."));
      };
      const handlers = [["playing", playing], ["ended", ended], ["error", failed], ["pause", paused]];
      player.media.set(media, handlers);
      for (const [name, fn] of handlers) media.addEventListener(name, fn);
      if (!media.paused && !media.ended) playing();
    }
  }
  function startPlayback(session, turn, found, activate) {
    const player = { turn, row: found.row, content: found.content, media: new Map(), activeMedia: new Set(), started: false,
      priorMedia: new Set(found.row.querySelectorAll("audio, video")) };
    playback = player;
    // Abort recognition and disable the microphone BEFORE native activation.
    hold(session);
    setStatus("requested", text("Native Read aloud requested. Microphone paused; waiting for observable playback.", "طُلبت القراءة الأصلية. الميكروفون معلّق بانتظار إشارة تشغيل قابلة للرصد."));
    attachMedia(player);
    watchSiteAlerts(player);
    player.observer = new MutationObserver(() => attachMedia(player));
    player.observer.observe(document.documentElement, { childList: true, subtree: true });
    player.startTimer = setTimeout(() => {
      if (playback !== player || player.started) return;
      setStatus("needs-confirmation", text("No reliable native playback signal. Audio may be playing, blocked, or unavailable. Use Play reply to reveal the native button / enable site audio. Confirm when audio has stopped to resume listening.", "لا توجد إشارة تشغيل أصلية موثوقة. قد يعمل الصوت أو يكون محظورًا/غير متاح. استخدم «تشغيل الرد» لإظهار الزر الأصلي أو السماح بالصوت، ثم أكّد توقفه لاستئناف الاستماع."));
    }, START_DEADLINE);
    if (activate) {
      try {
        // Arm the page-context observer immediately before the native click.
        emit(PLAYBACK_ARM, { turnId: turn.id });
        player.activating = true; found.button.click();
        try { console.info("[BDS native-read] clicked native Read aloud", { turn: turn.id, rowKey: turn.rowKey, terminal: turn.terminal }); } catch {}
      }
      catch { setStatus("audio-failed", text("Native control activation failed. Use the site's control; no alternate voice will play.", "تعذّر تفعيل الزر الأصلي. استخدم زر الموقع؛ لن يعمل صوت بديل.")); }
      finally { player.activating = false; }
    }
  }
  function stopPlayback(reason = "stop") {
    const player = playback;
    if (!player) return { safe: true };
    if (player.started && player.activeMedia.size && !player.ambiguous) {
      let safe = true;
      for (const media of player.activeMedia) {
        try { media.pause(); if (!media.paused) safe = false; } catch { safe = false; }
      }
      if (safe) { finishPlayback(player, "stopped"); return { safe: true }; }
    }
    // Never toggle Read aloud to stop: its toggle/stop behavior isn't verified.
    setStatus("stop-unverified", text("Cannot verify stopping this native player. Stop audio using DeepSeek/browser controls, then press “Audio stopped — resume listening”. The microphone remains paused.", "لا يمكن التحقق من إيقاف هذا المشغّل. أوقف الصوت من DeepSeek/المتصفح، ثم اضغط «توقف الصوت — استئناف الاستماع». يبقى الميكروفون معلّقًا."));
    return { safe: false, reason };
  }
  function onNativeClick(event) {
    if (!live || !current(live) || playback?.activating) return;
    const button = event.target?.closest?.(READ);
    if (!button || !event.isTrusted) return;
    const row = button.closest(ROW), content = row && assistant(row);
    if (!row || !content || content.contains(button)) return;
    if (playback) {
      // A manual second activation can switch/overlap a site-owned Web Audio
      // player we cannot attribute. Never release on the first player's ended.
      playback.ambiguous = true; removeMediaListeners(playback); hold(live);
      setStatus("stop-unverified", text("Manual native playback changed while Live audio was active. Stop all site audio, then explicitly confirm before listening resumes.", "تغيّر التشغيل الأصلي يدويًا أثناء صوت Live. أوقف كل صوت الموقع ثم أكّد قبل استئناف الاستماع."));
      return;
    }
    // Manual Read aloud remains a site action. Only protect the active Live mic.
    const turn = { id: live.turn?.id || `manual_${Date.now()}`, rowKey: keyOf(row) };
    if (!turn.rowKey) return;
    if (live.turn?.rowKey === turn.rowKey) { live.turn.attempted = true; clearTurnTimers(live.turn); }
    emit(PLAYBACK_ARM, { turnId: turn.id });
    startPlayback(live, turn, { row, content, button }, false);
  }
  function onNativePlayback(event) {
    const data = detailOf(event), player = playback;
    if (!data || !player || !data.turnId || data.turnId !== player.turn.id) return;
    if (data.state === "start") {
      player.started = true; clearTimeout(player.startTimer);
      setStatus("playing", text("Native Read aloud is playing. Microphone paused.", "تعمل القراءة الأصلية. الميكروفون معلّق."));
      try { console.info("[BDS native-read] native playback started", { kind: data.kind }); } catch {}
      return;
    }
    if (data.state === "error") {
      // The site rejected play (for example autoplay policy). No audio is
      // playing, so it is safe to hand the microphone back with a visible hint.
      removeMediaListeners(player);
      if (player.startTimer) clearTimeout(player.startTimer);
      playback = null;
      setStatus("audio-failed", text("DeepSeek's player was blocked. Allow site audio, then use Play reply.", "حُظر مشغّل DeepSeek. اسمح بصوت الموقع ثم استخدم «تشغيل الرد»."));
      release("audio-failed", true);
      return;
    }
    if (data.state === "end") {
      try { console.info("[BDS native-read] native playback ended", { kind: data.kind }); } catch {}
      finishPlayback(player, "ended");
    }
  }
  function startLive(options) {
    endLive("replaced");
    const session = { options, conversation: conversation(), turn: null, closed: false, observer: null };
    live = session;
    window.addEventListener(GENERATION, onGeneration);
    window.addEventListener(PLAYBACK, onNativePlayback);
    document.addEventListener("click", onNativeClick, true);
    if (playback) hold(session);
    else setStatus("idle", text("Live will use the reply's native Read aloud control after verified completion.", "سيستخدم Live زر القراءة الأصلي للرد بعد التحقق من اكتماله."));
    return {
      beginTurn: (value) => beginTurn(session, value),
      cancel: (reason) => live === session && !session.closed ? cancelTurn(session, reason) : { safe: true, stale: true },
      stop: (reason) => { if (live === session) endLive(reason || "live-ended"); },
      get held() { return Boolean(playback); },
    };
  }
  function endLive(reason = "live-ended") {
    const session = live;
    if (!session) return;
    session.closed = true;
    cancelTurn(session, reason);
    window.removeEventListener(GENERATION, onGeneration);
    window.removeEventListener(PLAYBACK, onNativePlayback);
    document.removeEventListener("click", onNativeClick, true);
    live = null;
    // An unobservable player cannot be asserted stopped. Keep only an explicit
    // safety latch/UI; no generation/DOM/media observers survive session end.
    if (playback) {
      removeMediaListeners(playback);
      // Live may be closed while native audio is unobservable; keep an honest
      // safety notice and the explicit confirmation control rather than idle.
      setStatus("stop-unverified", text("Live ended while native audio was unverified. Stop site audio, then confirm before starting again.", "انتهى Live وصوت الموقع غير مؤكد. أوقف الصوت ثم أكّد قبل البدء مجددًا."));
    } else setStatus("idle", "");
  }
  function confirmStopped() {
    if (!playback) return;
    finishPlayback(playback, "user-confirmed", true);
  }
  function revealReply() {
    const turn = playback?.turn || live?.turn;
    const found = locate(turn);
    if (!playback && live && turn?.completed && found.button) {
      // A real trusted click on this control forwards activation to the site's
      // button synchronously, which is the supported way to satisfy autoplay.
      startPlayback(live, turn, found, true);
      return;
    }
    if (found.button) { found.button.scrollIntoView?.({ block: "center" }); found.button.focus?.(); }
    setStatus("needs-confirmation", text("Use DeepSeek's highlighted Read aloud button yourself; allow site audio if blocked. This action does not retry or toggle audio. Confirm after it stops.", "اضغط بنفسك زر القراءة الأصلي الذي تم التركيز عليه، واسمح بالصوت إن حُظر. هذا الإجراء لا يكرر التشغيل أو يبدّله. أكّد بعد توقفه."));
  }
  function render() {
    if (disposed || !document.body) return;
    if (!ui) {
      ui = document.createElement("section"); ui.className = "bds-native-live-audio";
      ui.setAttribute("aria-label", "Live native Read aloud");
      const message = document.createElement("p"); message.setAttribute("role", "status"); message.setAttribute("aria-live", "polite");
      const play = document.createElement("button"), stop = document.createElement("button"), confirm = document.createElement("button");
      for (const button of [play, stop, confirm]) button.type = "button";
      play.dataset.nativePlay = ""; stop.dataset.nativeStop = ""; confirm.dataset.nativeConfirm = "";
      play.addEventListener("click", revealReply); stop.addEventListener("click", () => { cancelTurn(live, "user-stop"); });
      confirm.addEventListener("click", confirmStopped);
      ui.append(message, play, stop, confirm); document.body.append(ui);
    }
    ui.hidden = !live && !playback;
    ui.dataset.code = status.code;
    ui.dir = arabic() ? "rtl" : "ltr";
    const message = ui.querySelector("p");
    if (message.textContent !== status.message) message.textContent = status.message;
    const play = ui.querySelector("[data-native-play]"), stop = ui.querySelector("[data-native-stop]"), confirm = ui.querySelector("[data-native-confirm]");
    play.textContent = text("Play reply / enable site audio", "تشغيل الرد / السماح بصوت الموقع");
    stop.textContent = text("Stop reply", "إيقاف الرد");
    confirm.textContent = text("Audio stopped — resume listening", "توقف الصوت — استئناف الاستماع");
    play.hidden = !playback; stop.hidden = !playback; confirm.hidden = !playback;
  }
  function onNavigate() {
    if (!live) return;
    // First send from a new chat changes "/" to "/chat/s/<id>": adopt it.
    // A genuinely different saved conversation still ends Live.
    if (!followConversation()) endLive("navigation");
    else notify();
  }
  function dispose() {
    if (disposed) return;
    endLive("teardown"); disposed = true;
    if (playback) removeMediaListeners(playback);
    window.removeEventListener("bds:urlChanged", onNavigate);
    window.removeEventListener("pagehide", dispose);
    window.removeEventListener("bds:teardown", dispose);
    document.removeEventListener("DOMContentLoaded", render);
    try { chrome.storage.onChanged.removeListener(onSettings); } catch {}
    listeners.clear(); ui?.remove(); ui = null;
  }
  window.addEventListener("bds:urlChanged", onNavigate);
  window.addEventListener("pagehide", dispose);
  window.addEventListener("bds:teardown", dispose);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render, { once: true });
  globalThis.BDSDeepSeekVoice = Object.freeze({
    ready, startLive, endLive, setAutoRead, inspect, confirmStopped, revealReply, dispose,
    cancel: (reason) => cancelTurn(live, reason),
    get settings() { return { autoRead: enabled(), liveNativeAutoRead: enabled() }; },
    get status() { return { ...status }; },
    get speaking() { return Boolean(playback); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    available() { return { supported: typeof document.querySelectorAll === "function", missing: [] }; },
    diagnostics() {
      const turn = live?.turn;
      return { integration: "native-read-aloud-ui", live: Boolean(live), autoRead: enabled(),
        status: status.code, playbackObservable: Boolean(playback?.media.size), browserSpeech: false,
        completion: "correlated-request + native-control-gate", identity: "observed-new-row-key",
        conversation: live?.conversation || null,
        turn: turn ? { id: turn.id, requestId: turn.requestId, rowKey: turn.rowKey, completed: turn.completed,
          terminal: turn.terminal || null, attempted: turn.attempted, locate: turn.rowKey ? locate(turn).code : null } : null };
    },
  });
})();
