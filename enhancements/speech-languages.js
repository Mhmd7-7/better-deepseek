/* Shared locale/voice helpers. Options are suggestions, not backend support guarantees.
 * Pure browser/Node IIFE: no recognition detection, storage, DOM, or network access.
 */
(() => {
  "use strict";

  const MAX_TAG_LENGTH = 60;
  const intl = globalThis.Intl;
  const asciiTag = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
  const languageAliases = Object.freeze({ iw: "he", in: "id", ji: "yi", jw: "jv", mo: "ro", tl: "fil", cmn: "zh" });
  const regionAliases = Object.freeze({ BU: "MM", DD: "DE", FX: "FR", TP: "TL", YD: "YE", ZR: "CD", UK: "GB" });

  function isSafeTag(value) {
    return typeof value === "string" && value.length > 0 && value.length <= MAX_TAG_LENGTH && asciiTag.test(value);
  }

  // Conservative Unicode/BCP47 grammar when Intl.getCanonicalLocales is absent.
  // Duplicate variants and extension singletons are invalid even without Intl.
  function basicCanonicalize(value) {
    const parts = value.split("-");
    let index = 0;
    let base = parts[index++].toLowerCase();
    if (!/^(?:[a-z]{2,3}|[a-z]{5,8})$/.test(base)) return null;
    let script = "", region = "";
    if (/^[a-z]{4}$/i.test(parts[index] || "")) {
      const part = parts[index++];
      script = part[0].toUpperCase() + part.slice(1).toLowerCase();
    }
    if (/^(?:[a-z]{2}|[0-9]{3})$/i.test(parts[index] || "")) region = parts[index++].toUpperCase();
    if (base === "sh") { base = "sr"; script = script || "Latn"; }
    if (base === "cnr") { base = "sr"; region = region || "ME"; }
    base = languageAliases[base] || base;
    region = regionAliases[region] || region;
    const output = [base, script, region].filter(Boolean);
    const variants = new Set();
    while (/^(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3})$/i.test(parts[index] || "")) {
      const variant = parts[index++].toLowerCase();
      if (variants.has(variant)) return null;
      variants.add(variant); output.push(variant);
    }
    const singletons = new Set(), extensions = [];
    while (/^[0-9a-wy-z]$/i.test(parts[index] || "")) {
      const singleton = parts[index++].toLowerCase();
      if (singletons.has(singleton)) return null;
      singletons.add(singleton);
      const extension = [singleton];
      while (/^[a-z0-9]{2,8}$/i.test(parts[index] || "")) extension.push(parts[index++].toLowerCase());
      if (extension.length === 1) return null;
      extensions.push(extension.join("-"));
    }
    extensions.sort(); output.push(...extensions);
    if ((parts[index] || "").toLowerCase() === "x") {
      output.push("x"); index++;
      const start = index;
      while (/^[a-z0-9]{1,8}$/i.test(parts[index] || "")) output.push(parts[index++].toLowerCase());
      if (index === start) return null;
    }
    return index === parts.length ? output.join("-") : null;
  }

  function validatedTag(value) {
    if (!isSafeTag(value)) return null;
    let tag;
    if (typeof intl?.getCanonicalLocales === "function") {
      try { tag = intl.getCanonicalLocales(value)[0]; } catch { return null; }
    } else {
      tag = basicCanonicalize(value);
    }
    return isSafeTag(tag) ? tag : null;
  }

  // Pass null as fallback when a caller needs validation rather than a default.
  function canonicalize(value, fallback = "en-US") {
    return validatedTag(value) || (fallback === null ? null : validatedTag(fallback) || "en-US");
  }

  function describe(value) {
    const tag = canonicalize(value, null);
    if (!tag) return null;
    const parts = tag.split("-");
    let index = 1, script = "", region = "";
    if (/^[A-Za-z]{4}$/.test(parts[index] || "")) script = parts[index++];
    if (/^(?:[A-Za-z]{2}|[0-9]{3})$/.test(parts[index] || "")) region = parts[index];
    const base = parts[0].toLowerCase();
    // Explicit scripts take precedence over a region's usual Chinese script.
    const chineseScript = base !== "zh" ? "" : script || ({ CN: "Hans", SG: "Hans", TW: "Hant", HK: "Hant", MO: "Hant" }[region] || "");
    return { tag, base, script, region, chineseScript };
  }

  function primary(tag) {
    return describe(tag)?.base || "";
  }

  function compatible(requested, offered) {
    return !!requested && !!offered && requested.base === offered.base &&
      (!requested.script || !offered.script || requested.script === offered.script) &&
      (requested.base !== "zh" || !requested.chineseScript || !offered.chineseScript || requested.chineseScript === offered.chineseScript);
  }

  function matchLanguage(requested, offered) {
    return compatible(describe(requested), describe(offered));
  }

  function languageRank(requested, offered) {
    if (!compatible(requested, offered)) return -1;
    if (requested.tag.toLowerCase() === offered.tag.toLowerCase()) return 0;
    if (requested.region && requested.region === offered.region) return 1;
    return 2;
  }

  // Explicit voice choices are authoritative: an unavailable/wrong-language id
  // must not silently fall back to a different voice or provider.
  function selectVoice(installed, language, preferred = "") {
    const requested = describe(language);
    if (!requested || !Array.isArray(installed) || typeof preferred !== "string") return null;
    let selected = null, selectedRank = Infinity;
    for (const voice of installed) {
      if (!voice || typeof voice.id !== "string" || !voice.id) continue;
      const rank = languageRank(requested, describe(voice.language));
      if (preferred) {
        if (voice.id === preferred && rank >= 0) return voice;
      } else if (rank >= 0 && rank < selectedRank) {
        selected = voice; selectedRank = rank;
      }
    }
    return selected;
  }

  function compareText(left, right) {
    left = typeof left === "string" ? left : "";
    right = typeof right === "string" ? right : "";
    return left < right ? -1 : left > right ? 1 : 0;
  }

  function selectBrowserVoice(voices, language, preferredURI = "") {
    const requested = describe(language);
    if (!requested || !Array.isArray(voices) || typeof preferredURI !== "string") return null;
    const candidates = [];
    for (const voice of voices) {
      if (!voice) continue;
      const offered = describe(voice.lang), rank = languageRank(requested, offered);
      if (rank < 0) continue;
      if (preferredURI) {
        if (voice.voiceURI === preferredURI) return voice;
      } else {
        candidates.push({ voice, offered, rank });
      }
    }
    candidates.sort((left, right) => left.rank - right.rank ||
      Number(right.voice.default === true) - Number(left.voice.default === true) ||
      Number(right.voice.localService === true) - Number(left.voice.localService === true) ||
      compareText(left.offered.tag, right.offered.tag) ||
      compareText(left.voice.voiceURI, right.voice.voiceURI) ||
      compareText(left.voice.name, right.voice.name));
    return candidates[0]?.voice || null;
  }

  const locales = [
    ["ar-SA", "العربية (السعودية)"], ["ar-EG", "العربية (مصر)"],
    ["ar-AE", "العربية (الإمارات)"], ["ar-JO", "العربية (الأردن)"],
    ["ar-MA", "العربية (المغرب)"], ["ar-DZ", "العربية (الجزائر)"],
    ["ar-TN", "العربية (تونس)"], ["ar-IQ", "العربية (العراق)"],
    ["ar-KW", "العربية (الكويت)"], ["ar-QA", "العربية (قطر)"],
    ["en-US", "English (United States)"], ["en-GB", "English (United Kingdom)"],
    ["en-AU", "English (Australia)"], ["en-CA", "English (Canada)"],
    ["en-IN", "English (India)"], ["en-IE", "English (Ireland)"],
    ["en-NZ", "English (New Zealand)"], ["en-ZA", "English (South Africa)"],
    ["zh-CN", "中文（中国大陆）"], ["zh-TW", "中文（台灣）"], ["zh-HK", "中文（香港）"],
    ["es-ES", "Español (España)"], ["es-MX", "Español (México)"], ["es-AR", "Español (Argentina)"],
    ["fr-FR", "Français (France)"], ["fr-CA", "Français (Canada)"],
    ["de-DE", "Deutsch (Deutschland)"], ["it-IT", "Italiano (Italia)"],
    ["pt-BR", "Português (Brasil)"], ["pt-PT", "Português (Portugal)"],
    ["nl-NL", "Nederlands (Nederland)"], ["ru-RU", "Русский (Россия)"],
    ["uk-UA", "Українська (Україна)"], ["pl-PL", "Polski (Polska)"],
    ["cs-CZ", "Čeština (Česko)"], ["sk-SK", "Slovenčina (Slovensko)"],
    ["hu-HU", "Magyar (Magyarország)"], ["ro-RO", "Română (România)"],
    ["bg-BG", "Български (България)"], ["el-GR", "Ελληνικά (Ελλάδα)"],
    ["tr-TR", "Türkçe (Türkiye)"], ["sv-SE", "Svenska (Sverige)"],
    ["da-DK", "Dansk (Danmark)"], ["nb-NO", "Norsk bokmål (Norge)"],
    ["fi-FI", "Suomi (Suomi)"], ["is-IS", "Íslenska (Ísland)"],
    ["sr-RS", "Српски (Србија)"], ["hr-HR", "Hrvatski (Hrvatska)"], ["ca-ES", "Català (Espanya)"],
    ["ja-JP", "日本語（日本）"], ["ko-KR", "한국어 (대한민국)"],
    ["hi-IN", "हिन्दी (भारत)"], ["bn-IN", "বাংলা (ভারত)"], ["bn-BD", "বাংলা (বাংলাদেশ)"],
    ["ta-IN", "தமிழ் (இந்தியா)"], ["te-IN", "తెలుగు (భారతదేశం)"],
    ["mr-IN", "मराठी (भारत)"], ["gu-IN", "ગુજરાતી (ભારત)"],
    ["kn-IN", "ಕನ್ನಡ (ಭಾರತ)"], ["ml-IN", "മലയാളം (ഇന്ത്യ)"], ["pa-IN", "ਪੰਜਾਬੀ (ਭਾਰਤ)"],
    ["ur-PK", "اردو (پاکستان)"], ["id-ID", "Bahasa Indonesia (Indonesia)"],
    ["ms-MY", "Bahasa Melayu (Malaysia)"], ["th-TH", "ไทย (ประเทศไทย)"],
    ["vi-VN", "Tiếng Việt (Việt Nam)"], ["fil-PH", "Filipino (Pilipinas)"],
    ["he-IL", "עברית (ישראל)"], ["fa-IR", "فارسی (ایران)"],
    ["sw-KE", "Kiswahili (Kenya)"], ["af-ZA", "Afrikaans (Suid-Afrika)"],
  ];

  function label(language, displayLocale = "en") {
    const tag = canonicalize(language, null);
    if (!tag) return "";
    if (typeof intl?.DisplayNames === "function") {
      try {
        const names = new intl.DisplayNames([canonicalize(displayLocale, "en")], { type: "language" });
        const name = names.of(tag);
        if (typeof name === "string" && name && name.toLowerCase() !== tag.toLowerCase()) return name;
      } catch { /* Native names remain usable with partial/missing Intl data. */ }
    }
    return locales.find(([value]) => value === tag)?.[1] || tag;
  }

  function listOptions(locale = "en") {
    return locales.map(([value]) => ({ value, label: label(value, locale) }));
  }

  // Samples are authored, not translated at runtime. Unknown languages/scripts
  // return null, so English is never inadvertently spoken by a non-English voice.
  const samples = {
    ar: ["Arab", "مرحباً! هذه عيّنة من الصوت المحدّد."],
    en: ["Latn", "Hello! This is a sample of the selected voice."],
    es: ["Latn", "¡Hola! Esta es una muestra de la voz seleccionada."],
    fr: ["Latn", "Bonjour ! Voici un aperçu de la voix sélectionnée."],
    de: ["Latn", "Hallo! Dies ist eine Hörprobe der ausgewählten Stimme."],
    it: ["Latn", "Ciao! Questo è un esempio della voce selezionata."],
    pt: ["Latn", "Olá! Esta é uma amostra da voz selecionada."],
    nl: ["Latn", "Hallo! Dit is een voorbeeld van de geselecteerde stem."],
    ru: ["Cyrl", "Здравствуйте! Это пример звучания выбранного голоса."],
    uk: ["Cyrl", "Вітаю! Це зразок звучання вибраного голосу."],
    pl: ["Latn", "Cześć! To jest próbka wybranego głosu."],
    cs: ["Latn", "Dobrý den! Toto je ukázka vybraného hlasu."],
    tr: ["Latn", "Merhaba! Bu, seçilen sesin bir örneğidir."],
    el: ["Grek", "Γεια σας! Αυτό είναι ένα δείγμα της επιλεγμένης φωνής."],
    ro: ["Latn", "Bună! Aceasta este o mostră a vocii selectate."],
    sv: ["Latn", "Hej! Det här är ett prov på den valda rösten."],
    da: ["Latn", "Hej! Dette er en prøve på den valgte stemme."],
    nb: ["Latn", "Hei! Dette er en prøve på den valgte stemmen."],
    no: ["Latn", "Hei! Dette er en prøve på den valgte stemmen."],
    fi: ["Latn", "Hei! Tämä on näyte valitusta äänestä."],
    ja: ["Jpan", "こんにちは。これは選択した音声のサンプルです。"],
    ko: ["Kore", "안녕하세요! 선택한 음성의 샘플입니다."],
    hi: ["Deva", "नमस्ते! यह चुनी गई आवाज़ का एक नमूना है।"],
    bn: ["Beng", "নমস্কার! এটি নির্বাচিত কণ্ঠের একটি নমুনা।"],
    ta: ["Taml", "வணக்கம்! இது தேர்ந்தெடுக்கப்பட்ட குரலின் மாதிரி."],
    te: ["Telu", "నమస్కారం! ఇది ఎంచుకున్న స్వరానికి ఒక నమూనా."],
    mr: ["Deva", "नमस्कार! हा निवडलेल्या आवाजाचा नमुना आहे."],
    gu: ["Gujr", "નમસ્તે! આ પસંદ કરેલા અવાજનો નમૂનો છે."],
    kn: ["Knda", "ನಮಸ್ಕಾರ! ಇದು ಆಯ್ಕೆ ಮಾಡಿದ ಧ್ವನಿಯ ಮಾದರಿಯಾಗಿದೆ."],
    ml: ["Mlym", "നമസ്കാരം! ഇത് തിരഞ്ഞെടുത്ത ശബ്ദത്തിന്റെ ഒരു മാതൃകയാണ്."],
    pa: ["Guru", "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਇਹ ਚੁਣੀ ਗਈ ਆਵਾਜ਼ ਦਾ ਇੱਕ ਨਮੂਨਾ ਹੈ।"],
    ur: ["Arab", "السلام علیکم! یہ منتخب آواز کا ایک نمونہ ہے۔"],
    id: ["Latn", "Halo! Ini adalah contoh suara yang dipilih."],
    ms: ["Latn", "Helo! Ini ialah contoh suara yang dipilih."],
    th: ["Thai", "สวัสดี นี่คือตัวอย่างเสียงที่เลือก"],
    vi: ["Latn", "Xin chào! Đây là mẫu giọng nói đã chọn."],
    fil: ["Latn", "Kumusta! Ito ay isang halimbawa ng napiling boses."],
    he: ["Hebr", "שלום! זוהי דוגמה של הקול שנבחר."],
    fa: ["Arab", "سلام! این نمونه‌ای از صدای انتخاب‌شده است."],
    sw: ["Latn", "Habari! Huu ni mfano wa sauti iliyochaguliwa."],
    af: ["Latn", "Hallo! Dit is 'n voorbeeld van die gekose stem."],
  };

  function sample(locale) {
    const language = describe(locale);
    if (!language) return null;
    if (language.base === "zh") {
      if (language.chineseScript && !["Hans", "Hant"].includes(language.chineseScript)) return null;
      return language.chineseScript === "Hant" ? "你好！這是所選語音的試聽範例。" : "你好！这是所选语音的试听示例。";
    }
    const known = Object.prototype.hasOwnProperty.call(samples, language.base) ? samples[language.base] : null;
    return known && (!language.script || language.script === known[0]) ? known[1] : null;
  }

  globalThis.BDSSpeechLanguages = Object.freeze({
    canonicalize, primary, matchLanguage, selectVoice, selectBrowserVoice, listOptions, label, sample,
  });
})();
