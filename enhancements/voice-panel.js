/* Voice panel: Live listening and the site's native Read aloud controls.
 * The controller owns per-turn identity, playback and settings. This panel only
 * inspects its status; opening, checking or closing this panel never plays audio.
 */
(() => {
  "use strict";

  const KEY = "bds_settings";
  const languages = globalThis.BDSSpeechLanguages;
  const disposers = [];
  let settings = null, readyResolved = null, openDialog = null, dialog = null, mounted = false, disposed = false;
  let voiceUnsubscribe = null, refreshPanel = null, observer = null, decorateTimer = 0, root = null;
  const decoratedButtons = new Set();
  const ready = new Promise((resolve) => { readyResolved = resolve; });

  const COPY = {
    ar: {
      title: "الصوت", heading: "الصوت وحالة القراءة", subtitle: "استماع Live · زر القراءة الأصلي في DeepSeek", close: "إغلاق",
      listenTitle: "Live (الاستماع)", language: "لغة استماع Live", hint: "اختيار اللغة يوجّه التعرّف على كلامك. القراءة تخص رد Live الحالي بعد اكتماله فقط.",
      custom: "لغة أخرى…", customLabel: "رمز اللغة BCP 47 مثل fr-FR أو sw-KE", applyLanguage: "تطبيق اللغة",
      invalidLanguage: "رمز لغة غير صالح. استخدم رمزًا مثل ar-SA أو fr-FR.", saveFailed: "تعذّر حفظ الإعدادات. حاول مجددًا.",
      readTitle: "القراءة الأصلية في Live", readToggle: "استخدم زر DeepSeek الأصلي لقراءة رد Live الحالي تلقائيًا",
      readHint: "تُستخدم أداة «القراءة بصوت عالٍ» الموجودة في صفحة DeepSeek فقط، بعد التحقق من هوية رد Live واكتماله. لا صوت محلي أو صوت متصفح بديل، ولا تشغيل لردود سابقة. زر الفحص لا يشغّل الصوت.",
      readReady: "واجهات فحص الصفحة متاحة؛ هذا لا يؤكد إتاحة الصوت لحسابك.", readUnavailable: "وحدة القراءة الأصلية لم تُحمّل. أعد تحميل الإضافة.",
      readMissing: (missing) => `فحص الصفحة غير متاح: ${missing}`,
      checkNative: "فحص زر القراءة الأصلي — بدون تشغيل", checkingNative: "جارٍ فحص حالة رد Live الحالي…", inspectFailed: "تعذّر فحص حالة زر القراءة الأصلي.",
      diagnostics: "نسخ التشخيص", diagnosticsCopied: "تم نسخ التشخيص بدون نصوص المحادثة.", copyFailed: "تعذّر النسخ.",
      liveHint: "حالة القراءة تُعرض في Live. لا يؤكد الفحص سماع الصوت أو انتهاءه؛ تُتبع فقط الإشارات التي أمكن التحقق منها.",
      states: {
        idle: "لا يوجد رد Live حالي للقراءة.", ready: "تم تحديد زر القراءة للرد الحالي؛ لم يُشغّل الفحص أي صوت.",
        missing: "لم يُعثر على زر قراءة أصلي موثوق للرد الحالي.", disabled: "القراءة التلقائية في Live معطّلة.",
        ambiguous: "هوية الرد أو زر القراءة غير واضحة؛ لن تُشغّل القراءة تلقائيًا.",
        "awaiting-completion": "جارٍ انتظار اكتمال رد Live الحالي.", "identity-unverified": "لم يمكن التحقق من هوية رد Live؛ لن يُختار رد بالتخمين.",
        starting: "طُلبت القراءة الأصلية للرد الحالي؛ جارٍ انتظار إشارة موثوقة.", playing: "تُظهر حالة القراءة الأصلية أن التشغيل نشط.",
        stopped: "أُوقفت القراءة الأصلية.", ended: "تُظهر إشارة القراءة الأصلية انتهاء التشغيل.",
        "playback-unverified": "أُرسلت القراءة، لكن لا توجد إشارة موثوقة تؤكد التشغيل أو انتهائه.", error: "تعذّر استخدام زر القراءة الأصلي للرد الحالي."
      }
    },
    en: {
      title: "Voice", heading: "Voice & read-aloud status", subtitle: "Live listening · DeepSeek's native Read aloud button", close: "Close",
      listenTitle: "Live (listening)", language: "Live listening language", hint: "The language guides recognition. Read aloud applies only to the current Live reply after it completes.",
      custom: "Another language…", customLabel: "BCP 47 language code, e.g. fr-FR or sw-KE", applyLanguage: "Apply language",
      invalidLanguage: "Invalid language code. Use a tag such as ar-SA or fr-FR.", saveFailed: "Could not save settings. Try again.",
      readTitle: "Native Read aloud in Live", readToggle: "Use DeepSeek's native button to read the current Live reply automatically",
      readHint: "Only the Read aloud control already on DeepSeek's page is used, after the current Live reply is identified and complete. No local or browser voice fallback; no historical replies. Checking the control does not play audio.",
      readReady: "Page-inspection APIs are available; this does not establish voice access for your account.", readUnavailable: "The native read-aloud controller did not load. Reload the extension.",
      readMissing: (missing) => `Page inspection is unavailable: ${missing}`,
      checkNative: "Check native Read aloud — no playback", checkingNative: "Checking the current Live reply…", inspectFailed: "Could not inspect the native Read aloud control.",
      diagnostics: "Copy diagnostics", diagnosticsCopied: "Diagnostics copied without conversation text.", copyFailed: "Could not copy.",
      liveHint: "Read-aloud status appears in Live. Inspection does not establish audible playback or completion; only verified signals are followed.",
      states: {
        idle: "There is no current Live reply to read.", ready: "The current reply's Read aloud control is identified; this check did not play audio.",
        missing: "No verified native Read aloud control was found for the current reply.", disabled: "Automatic native Read aloud in Live is off.",
        ambiguous: "The reply or its control is ambiguous; automatic playback will not start.",
        "awaiting-completion": "Waiting for the current Live reply to finish.", "identity-unverified": "The current Live reply's identity could not be verified; no reply will be guessed.",
        starting: "Native Read aloud was requested for the current reply; awaiting a verified signal.", playing: "The native read-aloud state reports active playback.",
        stopped: "Native Read aloud was stopped.", ended: "A native read-aloud signal reports playback ended.",
        "playback-unverified": "Read aloud was requested, but no verified signal establishes playback or completion.", error: "The current reply's native Read aloud control could not be used."
      }
    }
  };
  const languageOf = (value) => /^ar(?:-|$)/i.test(value || "") ? "ar" : "en";
  const storage = () => {
    try { return globalThis.chrome?.storage?.local || null; } catch { return null; }
  };
  function listen(target, name, handler, options) {
    target?.addEventListener?.(name, handler, options);
    disposers.push(() => target?.removeEventListener?.(name, handler, options));
  }
  function teardown() {
    if (disposed) return;
    disposed = true;
    clearTimeout(decorateTimer);
    decorateTimer = 0;
    observer?.disconnect(); observer = null;
    voiceUnsubscribe?.(); voiceUnsubscribe = null;
    for (const dispose of disposers.splice(0)) { try { dispose(); } catch {} }
    for (const button of decoratedButtons) button.remove();
    decoratedButtons.clear();
    root?.remove(); root = null;
    refreshPanel = openDialog = null;
    dialog = null;
    mounted = false;
    // The controller, not this settings dialog, owns ongoing native playback.
  }
  listen(globalThis.window, "pagehide", teardown, { once: true });

  async function load() {
    const local = storage();
    if (!local) { settings = {}; readyResolved(); return; }
    try {
      const stored = await local.get(KEY);
      settings = { ...(stored?.[KEY] || {}) };
    } catch { settings = {}; }
    readyResolved();
  }
  try {
    const onChanged = (changes, area) => {
      if (disposed || area !== "local" || !changes?.[KEY]) return;
      settings = { ...(changes[KEY].newValue || {}) };
      refreshPanel?.();
    };
    globalThis.chrome?.storage?.onChanged?.addListener(onChanged);
    disposers.push(() => globalThis.chrome?.storage?.onChanged?.removeListener?.(onChanged));
  } catch {}

  function preference(name, fallback = "") {
    const value = settings?.[name];
    return typeof value === "string" ? value : fallback;
  }
  function resolvedLanguage(fallback = navigator.language || "en-US") {
    return languages?.canonicalize(preference("voiceLanguage") || fallback) || fallback;
  }
  async function save(patch) {
    const previous = settings;
    settings = { ...settings, ...patch };
    const local = storage();
    if (!local) return;
    try {
      const stored = await local.get(KEY);
      await local.set({ [KEY]: { ...(stored?.[KEY] || {}), ...patch } });
    } catch { settings = previous; throw new Error("save failed"); }
  }
  function diagnostics() {
    return { panel: "bds-voice-panel", language: resolvedLanguage(),
      deepseekVoice: globalThis.BDSDeepSeekVoice?.diagnostics?.() || null,
      extensionVersion: globalThis.chrome?.runtime?.getManifest?.().version || "unknown" };
  }

  function mount() {
    if (disposed || mounted || !document.body || document.getElementById("bds-voice-panel")) return;
    mounted = true;
    root = document.createElement("div");
    root.id = "bds-voice-panel";
    root.innerHTML = `<dialog aria-labelledby="bds-voice-heading"><header><div><span class="bds-voice-eyebrow" dir="ltr">BDS VOICE</span><h2 id="bds-voice-heading"></h2><p data-subtitle></p></div><button type="button" data-close><span aria-hidden="true">×</span></button></header>
      <section class="bds-voice-block"><h3 data-listen-title></h3>
        <label data-label="language"><span></span><select data-language></select></label>
        <div data-custom-language hidden><label><span data-custom-label></span><input data-custom-tag type="text" maxlength="60" spellcheck="false" dir="ltr" placeholder="fr-FR"></label><button type="button" data-apply-language></button></div>
        <p data-language-hint></p><small data-live-hint></small>
      </section>
      <section class="bds-voice-block"><h3 data-read-title></h3>
        <label class="bds-voice-check"><input type="checkbox" data-auto-read-toggle><span></span></label>
        <small data-native-support></small>
        <p role="status" aria-live="polite" data-native-status></p>
        <div class="bds-voice-actions"><button type="button" data-inspect-native></button></div>
      </section>
      <p role="status" aria-live="polite" data-status></p>
      <small data-read-hint></small>
      <button type="button" data-diagnostics></button></dialog>`;
    document.body.append(root);

    dialog = root.querySelector("dialog");
    const languageSelect = root.querySelector("[data-language]");
    const status = root.querySelector("[data-status]");
    const autoReadToggle = root.querySelector("[data-auto-read-toggle]");
    const nativeSupport = root.querySelector("[data-native-support]");
    const nativeState = root.querySelector("[data-native-status]");
    const nativeButton = root.querySelector("[data-inspect-native]");
    let language = languageOf(document.documentElement.lang || navigator.language), previousFocus = null, fromLive = false, inspecting = false;
    const t = () => COPY[language];
    const setStatus = (value) => { status.textContent = value || ""; };
    const deepseekVoice = () => globalThis.BDSDeepSeekVoice || null;
    function renderNativeStatus(value) {
      const code = typeof value?.code === "string" ? value.code : "idle";
      nativeState.dataset.code = code;
      nativeState.textContent = t().states[code] || (typeof value?.message === "string" ? value.message : t().inspectFailed);
    }
    function setOptions(node, options, value) {
      const signature = options.map((item) => `${item.value}\u0001${item.label}`).join("\u0002");
      if (node.dataset.signature !== signature) {
        node.replaceChildren(...options.map(({ value: optionValue, label }) => {
          const option = document.createElement("option"); option.value = optionValue; option.textContent = label; return option;
        }));
        node.dataset.signature = signature;
      }
      node.value = value;
    }
    function render() {
      if (disposed || !dialog) return;
      const text = t(), chosenLanguage = resolvedLanguage();
      const options = (languages?.listOptions(language) || []).map((item) => ({ value: item.value, label: item.label }));
      if (chosenLanguage && !options.some((item) => item.value === chosenLanguage)) {
        options.unshift({ value: chosenLanguage, label: languages?.label(chosenLanguage, language) || chosenLanguage });
      }
      options.push({ value: "custom", label: text.custom });
      if (languageSelect.value !== "custom") setOptions(languageSelect, options, chosenLanguage);
      renderReadAloud();
    }
    refreshPanel = () => { if (dialog?.open) render(); };
    function renderReadAloud() {
      if (disposed || !dialog) return;
      const text = t(), voice = deepseekVoice();
      autoReadToggle.checked = voice?.settings?.autoRead === true;
      const support = voice?.available?.() || { supported: false, missing: ["BDSDeepSeekVoice"] };
      const blocked = !voice || !support.supported;
      autoReadToggle.disabled = blocked;
      nativeButton.disabled = blocked || inspecting || typeof voice?.inspect !== "function";
      nativeSupport.textContent = !voice ? text.readUnavailable
        : support.supported ? text.readReady : text.readMissing((support.missing || []).join(", "));
      nativeSupport.dataset.state = voice && support.supported ? "available" : "missing";
      nativeButton.textContent = text.checkNative;
      renderNativeStatus(voice?.status);
    }
    function open(options = {}) {
      if (disposed || !dialog) return false;
      if (dialog.open) { dialog.focus(); return true; }
      const competing = Array.from(document.querySelectorAll('dialog[open], [aria-modal="true"]')).some((node) => node !== dialog && node.getClientRects().length > 0);
      if (competing) return false;
      language = languageOf(options.locale || document.documentElement.lang || navigator.language);
      fromLive = Boolean(options.fromLive);
      previousFocus = document.activeElement;
      const text = t();
      root.lang = language; root.dir = language === "ar" ? "rtl" : "ltr";
      root.querySelector("h2").textContent = text.heading;
      root.querySelector("[data-subtitle]").textContent = text.subtitle;
      root.querySelector("[data-close]").setAttribute("aria-label", text.close);
      root.querySelector("[data-listen-title]").textContent = text.listenTitle;
      root.querySelector("[data-read-title]").textContent = text.readTitle;
      root.querySelector('[data-label="language"] > span').textContent = text.language;
      root.querySelector("[data-language-hint]").textContent = text.hint;
      root.querySelector("[data-live-hint]").textContent = text.liveHint;
      root.querySelector("[data-custom-label]").textContent = text.customLabel;
      root.querySelector("[data-apply-language]").textContent = text.applyLanguage;
      autoReadToggle.parentElement.querySelector("span").textContent = text.readToggle;
      root.querySelector("[data-read-hint]").textContent = text.readHint;
      root.querySelector("[data-diagnostics]").textContent = text.diagnostics;
      setStatus(""); render();
      dialog.showModal();
      languageSelect.focus();
      void ready.then(() => { if (!disposed && dialog?.open) render(); });
      const voice = deepseekVoice();
      if (voice?.subscribe && !voiceUnsubscribe) voiceUnsubscribe = voice.subscribe(() => { if (dialog?.open) renderReadAloud(); });
      return true;
    }
    openDialog = open;

    listen(root.querySelector("[data-close]"), "click", () => dialog.close());
    listen(dialog, "close", () => {
      // Closing settings must not stop the site's player or an ongoing Live turn.
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    });
    listen(dialog, "keydown", (event) => event.stopPropagation());
    listen(dialog, "click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    listen(languageSelect, "change", () => {
      if (languageSelect.value === "custom") {
        root.querySelector("[data-custom-language]").hidden = false;
        root.querySelector("[data-custom-tag]").focus();
        return;
      }
      const selected = languageSelect.value;
      root.querySelector("[data-custom-language]").hidden = true;
      setStatus("");
      save({ voiceLanguage: selected, voiceLanguageChosen: true }).then(render, () => { if (!disposed) setStatus(t().saveFailed); });
    });
    listen(root.querySelector("[data-apply-language]"), "click", () => {
      const selected = languages?.canonicalize(root.querySelector("[data-custom-tag]").value.trim(), null);
      if (!selected) { setStatus(t().invalidLanguage); return; }
      save({ voiceLanguage: selected, voiceLanguageChosen: true }).then(() => {
        if (disposed) return;
        root.querySelector("[data-custom-language]").hidden = true; render(); setStatus("");
      }, () => { if (!disposed) setStatus(t().saveFailed); });
    });
    listen(autoReadToggle, "change", () => {
      const voice = deepseekVoice(); if (!voice) return;
      const value = autoReadToggle.checked === true;
      setStatus("");
      Promise.resolve().then(() => voice.setAutoRead(value)).then(renderReadAloud, () => {
        if (disposed) return;
        renderReadAloud(); setStatus(t().saveFailed);
      });
    });
    listen(nativeButton, "click", () => {
      const voice = deepseekVoice(); if (!voice?.inspect || inspecting) return;
      inspecting = true;
      setStatus(t().checkingNative); renderReadAloud();
      Promise.resolve().then(() => voice.inspect()).then((result) => {
        if (disposed) return;
        inspecting = false; renderReadAloud(); renderNativeStatus(result); setStatus("");
      }, () => {
        if (disposed) return;
        inspecting = false; renderReadAloud(); setStatus(t().inspectFailed);
      });
    });
    listen(root.querySelector("[data-diagnostics]"), "click", async () => {
      try { await navigator.clipboard.writeText(JSON.stringify(diagnostics(), null, 2)); if (!disposed && dialog?.open) setStatus(t().diagnosticsCopied); }
      catch { if (!disposed && dialog?.open) setStatus(t().copyFailed); }
    });

    const decorate = () => {
      if (disposed) return;
      const panel = document.querySelector(".bds-live");
      if (!panel && dialog.open && fromLive) dialog.close();
      const top = panel?.querySelector(".bds-live__top");
      if (!top || top.querySelector("[data-bds-voice]")) return;
      const button = document.createElement("button");
      button.type = "button"; button.dataset.bdsVoice = ""; button.className = "bds-voice-button";
      button.textContent = t().title;
      listen(button, "click", () => open({ fromLive: true, locale: document.documentElement.lang }));
      decoratedButtons.add(button);
      top.insertBefore(button, top.querySelector(".bds-live__close"));
    };
    const scheduleDecorate = () => {
      if (disposed || decorateTimer) return;
      decorateTimer = setTimeout(() => { decorateTimer = 0; decorate(); }, 100);
    };
    observer = new MutationObserver((records) => {
      if (records.some((record) => !root.contains(record.target))) scheduleDecorate();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    decorate();
  }

  void load().then(() => {
    if (disposed) return;
    if (document.readyState === "loading") listen(document, "DOMContentLoaded", mount, { once: true }); else mount();
  });
  globalThis.BDSVoicePanel = Object.freeze({
    ready,
    get settings() { return { language: resolvedLanguage() }; },
    open(options) { if (!mounted) mount(); return openDialog?.(options) ?? false; },
    diagnostics
  });
})();
