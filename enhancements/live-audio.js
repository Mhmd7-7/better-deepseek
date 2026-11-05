/* BDS Live audio fixes for the packaged extension; no build step required. */
(() => {
  "use strict";

  const SENTENCE = /^([\s\S]*?(?:[。！？、，]|[.!?؟۔،؛;\n]+(?:\s+|$)))/u;
  const FATAL_RECOGNITION = new Set(["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"]);
  const textOf = (value) => String(value || "").trim();
  const joinText = (a, b) => [textOf(a), textOf(b)].filter(Boolean).join(" ");

  function splitSpeech(text, limit = 220) {
    const chunks = [];
    let rest = textOf(text);
    while (rest.length > limit) {
      const head = rest.slice(0, limit);
      const boundary = Math.max(head.lastIndexOf(" "), head.lastIndexOf("،") + 1, head.lastIndexOf(",") + 1);
      const end = boundary > limit / 3 ? boundary : limit;
      chunks.push(rest.slice(0, end).trim());
      rest = rest.slice(end).trim();
    }
    if (rest) chunks.push(rest);
    return chunks;
  }

  // Permission requests cannot be aborted. Dispose their eventual result instead.
  function safeVAD(Base) {
    return class LiveVAD extends Base {
      async start() {
        if (this.isRunning) return;
        const epoch = this._startEpoch = (this._startEpoch || 0) + 1;
        let stream = null;
        let context = null;
        const current = () => this._startEpoch === epoch;
        const dispose = () => {
          stream?.getTracks().forEach((track) => track.stop());
          if (context && context.state !== "closed") Promise.resolve(context.close()).catch(() => {});
        };
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: {
            echoCancellation: true, noiseSuppression: true, autoGainControl: true,
          } });
          if (!current()) { dispose(); return; }
          stream.getAudioTracks().forEach((track) => { track.enabled = !this._bdsMuted?.(); });
          this._stream = stream;
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          context = new AudioContext();
          this._audioContext = context;
          if (context.state === "suspended") await context.resume();
          if (!current()) { dispose(); return; }
          this._source = context.createMediaStreamSource(stream);
          this._analyser = context.createAnalyser();
          this._analyser.fftSize = 1024;
          this._analyser.smoothingTimeConstant = 0.8;
          this._source.connect(this._analyser);
          this.state = "silent";
          this.speechFrames = this.silenceFrames = this.lastSpeechTime = this.noiseFloor = this._speechStartTime = 0;
          this._stopped = false;
          this.isRunning = true;
          this._processFrame();
        } catch (error) {
          if (current()) this.stop();
          else dispose();
          throw error;
        }
      }
      stop() {
        this._startEpoch = (this._startEpoch || 0) + 1;
        super.stop();
      }
    };
  }

  function install(Engine, { state, VAD, sendPrompt, prepare, pushConfig, cleanSpeech, log = () => {} }) {
    const proto = Engine.prototype;
    if (proto._bdsAudioInstalled) return;
    proto._bdsAudioInstalled = true;
    const LiveVAD = safeVAD(VAD);
    const originalStop = proto.stop;
    const originalStopWatch = proto.stopResponseWatcher;

    proto._liveCurrent = function (session = this._session) {
      return this._session > 0 && !this.destroyed && state.liveMode.active && session === this._session;
    };
    proto.setStatus = function (status) {
      const next = this.isMuted ? "muted" : status;
      if (this.status === next && state.liveMode.status === next) return;
      this.status = state.liveMode.status = next;
      this.onStateChange?.(next);
      log("Live", `Status changed -> ${next}`);
    };
    proto.start = function () {
      if (this._liveCurrent()) return this._startPromise || Promise.resolve({ supported: true });
      const starting = this._beginLive();
      const session = this._session;
      const pending = starting.catch((error) => {
        if (session === this._session) this.stop();
        log("Live", "Audio startup failed", error);
        return { supported: false, error: error.message || "Audio startup failed" };
      });
      this._startPromise = pending;
      pending.then(() => { if (this._startPromise === pending) this._startPromise = null; },
        () => { if (this._startPromise === pending) this._startPromise = null; });
      return pending;
    };
    proto._beginLive = async function () {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) return { supported: false, error: "SpeechRecognition unsupported" };
      const session = this._session = (this._session || 0) + 1;
      const speechLanguages = globalThis.BDSSpeechLanguages;
      const baseLanguage = state.settings.voiceLanguage || navigator.language || "en-US";
      this.speechLang = speechLanguages?.canonicalize(baseLanguage) || baseLanguage;
      this._settingsListener?.();
      const onSettings = (changes, area) => {
        if (area !== "local" || !changes?.bds_settings) return;
        if (!this._liveCurrent(session)) return;
        const next = changes.bds_settings.newValue || {};
        const language = speechLanguages?.canonicalize(next.voiceLanguage || baseLanguage) || baseLanguage;
        if (language !== this.speechLang) this._applySpeechLanguage(language);
      };
      try { chrome.storage?.onChanged?.addListener(onSettings); } catch {}
      this._settingsListener = () => { try { chrome.storage?.onChanged?.removeListener(onSettings); } catch {} };
      // The native UI controller calls these hooks before clicking Read aloud.
      // No boolean/timer event is treated as proof that the site finished audio.
      this._turn = (this._turn || 0) + 1;
      this.destroyed = this.isMuted = this.isWaitingForResponse = this._recognitionBlocked = false;
      this._nativePaused = false;
      this._recognitionFailures = 0;
      this.silenceTimeout = Math.max(600, Math.min(2500, Number(state.settings.vadSilenceTimeout) || 900));
      this.currentTranscript = this.accumulatedTranscript = "";
      this.lastTranscriptUpdateTime = 0;
      this._submitLock = false;
      this.recentSpokenChunks = [];
      this.cancelTTS();
      state.liveMode.active = true;
      state.liveMode.isMuted = false;
      prepare();
      pushConfig();
      this._pageHideHandler = () => this.stop();
      window.addEventListener("pagehide", this._pageHideHandler);
      this.urlChangeHandler = () => {
        // Starting from a new chat changes "/" to "/chat/s/<id>"; the native
        // controller adopts that same conversation. Only a real switch ends Live.
        const stays = this._nativeLive?.followConversation?.();
        if (stays === false) { this.stop(); return; }
        if (this.activeAssistantNode && !this.activeAssistantNode.isConnected) this.activeAssistantNode = null;
        if (this.lastAssistantNode && !this.lastAssistantNode.isConnected) this.lastAssistantNode = null;
      };
      window.addEventListener("bds:urlChanged", this.urlChangeHandler);
      this.setStatus("listening");
      this._nativeLive = globalThis.BDSDeepSeekVoice?.startLive?.({
        isCurrent: () => this._liveCurrent(session),
        onHold: () => this._pauseForNativeSpeech(),
        onRelease: ({ verified, userConfirmed }) => {
          if ((verified || userConfirmed) && this._liveCurrent(session)) this._resumeAfterNativeSpeech();
        },
        onGenerationStart: () => {
          if (!this._liveCurrent(session)) return;
          this.isWaitingForResponse = true;
          if (!this._nativePaused) this.setStatus("thinking");
        },
        onGenerationEnd: () => {
          if (!this._liveCurrent(session)) return;
          this.isWaitingForResponse = false;
          if (!this._nativePaused) this.setStatus("listening");
        },
      });
      const vad = new LiveVAD({ continuous: true, silenceTimeout: this.silenceTimeout,
        hangoverFrames: 10, minSpeechFrames: 3, minSpeechDurationMs: 250 });
      this.vadProcessor = vad;
      // The controller surfaces why native Read aloud did not start (missing,
      // disabled, ambiguous, unverified). Keep it visible outside the panel.
      this._nativeStatusHandler = (event) => {
        let detail = event?.detail;
        if (typeof detail === "string") { try { detail = JSON.parse(detail); } catch { return; } }
        if (!detail?.message || !this._liveCurrent(session)) return;
        try { state.ui?.showToast?.(detail.message); } catch {}
      };
      window.addEventListener("bds:native-read-status", this._nativeStatusHandler);
      vad._bdsMuted = () => this.isMuted || this._nativePaused;
      vad.onSpeechStart = () => { if (this._liveCurrent(session)) this.handleUserSpeechStart(); };
      vad.onSpeechEnd = () => { if (this._liveCurrent(session)) this.handleUserSpeechEnd(); };
      vad.onVADStop = () => { if (this._liveCurrent(session)) this.handleUserSilenceStop("vad"); };
      // Start recognition without waiting for AudioContext initialization.
      const microphone = vad.start();
      this.initRecognition(Recognition);
      try { await microphone; }
      catch (error) {
        if (!this._liveCurrent(session)) return { supported: false, cancelled: true };
        if (["NotAllowedError", "SecurityError", "NotFoundError"].includes(error.name)) {
          this.stop();
          this._reportAudioError(error.name);
          return { supported: false, error: error.name };
        }
        log("Live", "VAD unavailable; continuing with speech-recognition silence detection", error);
      }
      if (!this._liveCurrent(session)) { vad.stop(); return { supported: false, cancelled: true }; }
      if (this.isMuted || this._nativePaused) vad._stream?.getAudioTracks().forEach((track) => { track.enabled = false; });
      return { supported: true };
    };
    proto._applySpeechLanguage = function (language) {
      if (language === this.speechLang) return;
      const wasResponding = this.isWaitingForResponse || this.status === "speaking" || this.status === "thinking";
      this._turn = (this._turn || 0) + 1;
      clearTimeout(this.speechSilenceTimer);
      this._submitLock = false;
      this.currentTranscript = this.accumulatedTranscript = "";
      this.lastTranscriptUpdateTime = 0;
      this.cancelTTS(); this.stopResponseWatcher();
      if (wasResponding) this.stopAIGeneration();
      this.speechLang = language;
      this.recentSpokenChunks = [];
      this.setStatus("listening");
      this.restartRecognition(); pushConfig();
    };
    proto._reportAudioError = function (error) {
      if (error === "language-not-supported") {
        state.ui?.showToast?.(this.speechLang.startsWith("ar")
          ? "المتصفح لا يدعم التعرّف على اللغة المختارة. اختر لغة أخرى من إعدادات الصوت."
          : "Speech recognition does not support this language. Choose another language in Voice settings.");
        return;
      }
      const arabic = this.speechLang.startsWith("ar");
      state.ui?.showToast?.(arabic
        ? `تعذّر تشغيل الميكروفون (${error}). تحقّق من إذن الميكروفون ثم افتح Live مجددًا.`
        : `Microphone unavailable (${error}). Check microphone access, then reopen Live.`);
    };
    proto._detachRecognition = function () {
      const recognition = this.recognition;
      this.recognition = null;
      if (!recognition) return;
      for (const event of ["onstart", "onend", "onerror", "onresult", "onspeechstart", "onspeechend"]) recognition[event] = null;
      try { recognition.abort(); } catch {}
    };
    proto._scheduleRecognitionRestart = function (delay = 150) {
      if (!this._liveCurrent() || this.isMuted || this._nativePaused || this._recognitionBlocked || this.restartRecognitionTimer) return;
      const session = this._session;
      this.restartRecognitionTimer = setTimeout(() => {
        this.restartRecognitionTimer = null;
        if (this._liveCurrent(session)) this.restartRecognition();
      }, delay);
    };
    proto.initRecognition = function (Recognition) {
      if (!this._liveCurrent() || this.isMuted || this._nativePaused || this._recognitionBlocked) return;
      const session = this._session;
      let recognition;
      try {
        recognition = new Recognition();
        this.recognition = recognition;
        recognition.lang = this.speechLang;
        recognition.interimResults = recognition.continuous = true;
        recognition._bdsFloor = recognition._bdsLength = 0;
        recognition._bdsPrefix = this.status === "listening" ? this.currentTranscript : "";
        const current = () => this._liveCurrent(session) && this.recognition === recognition && !this.isMuted && !this._nativePaused;
        recognition.onstart = () => { if (current()) log("Live", "Recognition started", this.speechLang); };
        recognition.onspeechstart = () => { if (current()) this.handleUserSpeechStart(); };
        recognition.onspeechend = () => { if (current()) this._scheduleSilence(); };
        recognition.onresult = (event) => {
          if (!current()) return;
          this._recognitionFailures = 0;
          recognition._bdsLength = event.results.length;
          const parts = [];
          for (let index = recognition._bdsFloor; index < event.results.length; index++) {
            parts.push(event.results[index][0]?.transcript || "");
          }
          const transcript = joinText(recognition._bdsPrefix, parts.join(" "));
          if (!transcript) return;
          const discardEcho = () => {
            // Only final entries are immutable; an interim echo may still become user speech.
            while (recognition._bdsFloor < event.results.length && event.results[recognition._bdsFloor].isFinal) recognition._bdsFloor++;
            recognition._bdsPrefix = "";
          };
          if (this.status === "speaking" || this.status === "thinking") {
            if (!this.isGenuineBargeIn(transcript)) { discardEcho(); return; }
            // Do not discard the very words that caused the interruption.
            this.handleBargeInInterruption();
          } else if (this.ttsEchoWindow && !this.isGenuineBargeIn(transcript)) {
            discardEcho();
            return;
          }
          if (this.currentTranscript === transcript) return;
          this.currentTranscript = transcript;
          this.lastTranscriptUpdateTime = Date.now();
          this._scheduleSilence();
        };
        recognition.onerror = (event) => {
          if (!current()) return;
          if (FATAL_RECOGNITION.has(event.error)) {
            this._recognitionBlocked = true;
            this.stop();
            this._reportAudioError(event.error);
            return;
          }
          if (event.error === "no-speech") return;
          this._recognitionFailures++;
          if (this._recognitionFailures >= 6) {
            this.stop(); this._reportAudioError(event.error); return;
          }
          this._scheduleRecognitionRestart(Math.min(3000, 300 * 2 ** (this._recognitionFailures - 1)));
        };
        recognition.onend = () => { if (current()) this._scheduleRecognitionRestart(); };
        recognition.start();
      } catch (error) {
        this._detachRecognition();
        if (["NotAllowedError", "SecurityError"].includes(error.name) || ++this._recognitionFailures >= 6) {
          this.stop(); this._reportAudioError(error.name);
        } else this._scheduleRecognitionRestart(Math.min(3000, 300 * 2 ** (this._recognitionFailures - 1)));
      }
    };
    proto.restartRecognition = function () {
      clearTimeout(this.restartRecognitionTimer);
      this.restartRecognitionTimer = null;
      this._detachRecognition();
      if (this._liveCurrent() && !this.isMuted && !this._nativePaused && !this._recognitionBlocked) {
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (Recognition) this.initRecognition(Recognition);
      }
    };
    proto._scheduleSilence = function (delay) {
      clearTimeout(this.speechSilenceTimer);
      this.speechSilenceTimer = null;
      if (!this._liveCurrent() || this.isMuted || this._nativePaused || this.status !== "listening" || !textOf(this.currentTranscript)) return;
      const session = this._session;
      const remaining = Math.max(0, this.silenceTimeout - (Date.now() - this.lastTranscriptUpdateTime));
      this.speechSilenceTimer = setTimeout(() => {
        this.speechSilenceTimer = null;
        if (this._liveCurrent(session)) this.handleUserSilenceStop("silence");
      }, delay ?? remaining);
    };
    proto.handleUserSpeechStart = function () {
      if (!this._liveCurrent() || this.isMuted) return;
      clearTimeout(this.speechSilenceTimer);
      this.speechSilenceTimer = null;
      // VAD noise alone must not cancel a response; wait for a genuine transcript.
    };
    proto.handleUserSpeechEnd = function () { this._scheduleSilence(); };
    proto.handleUserSilenceStop = function () {
      if (!this._liveCurrent() || this.isMuted || this.status !== "listening" || this._submitLock) return;
      const transcript = textOf(this.currentTranscript);
      if (!transcript) return;
      const vad = this.vadProcessor;
      if (vad?.isRunning && vad.state === "speaking" && performance.now() - vad.lastSpeechTime < 200) {
        this._scheduleSilence(120); return;
      }
      if (Date.now() - this.lastTranscriptUpdateTime < this.silenceTimeout) { this._scheduleSilence(); return; }
      this._submitLock = true;
      this.currentTranscript = this.accumulatedTranscript = "";
      void this.submitUserPrompt(transcript);
    };
    proto.submitUserPrompt = async function (prompt) {
      if (!this._liveCurrent() || this.isMuted || this._nativePaused || !textOf(prompt)) { this._submitLock = false; return; }
      this._submitLock = true;
      const session = this._session;
      const turn = this._turn = (this._turn || 0) + 1;
      const sameTurn = () => this._liveCurrent(session) && this._turn === turn;
      const current = () => sameTurn() && !this.isMuted && !this._nativePaused;
      clearTimeout(this.speechSilenceTimer);
      this.cancelTTS();
      this.currentTranscript = this.accumulatedTranscript = "";
      this.lastTranscriptUpdateTime = 0;
      this.spokenOffset = 0;
      this.activeAssistantNode = null;
      this.lastSubmittedPrompt = textOf(prompt);
      this.isWaitingForResponse = true;
      this.setStatus("thinking");
      this.restartRecognition();
      prepare();
      // Arm before sendPrompt: the page bridge consumes this exact prompt once
      // and correlates the real request. No historical/latest-row scanning.
      this._nativeTurn = this._nativeLive?.beginTurn?.({ turnId: `live-${session}-${turn}`, prompt });
      try {
        // Na/JK already accept a cancellation predicate, including before the actual send.
        const sent = await sendPrompt(prompt, "Live Voice Prompt", current);
        if (!current()) {
          if (this._liveCurrent(session) && this._turn === turn) { this._submitLock = false; this._nativeTurn?.cancel?.(); }
          return;
        }
        if (!sent) { this._nativeTurn?.cancel?.(); this.isWaitingForResponse = false; this.setStatus("listening"); }
      } catch (error) {
        if (sameTurn()) { this._nativeTurn?.cancel?.(); this.isWaitingForResponse = false; if (!this._nativePaused) this.setStatus("listening"); }
        log("Live", "Could not submit voice prompt", error);
      } finally { if (sameTurn()) this._submitLock = false; }
    };
    // Native UI controller owns completion; the bundle's text-inactivity poller
    // must not independently complete or read a Live response.
    proto.startResponseWatcher = function () {};
    proto.stopResponseWatcher = function () { originalStopWatch.call(this); this.isWaitingForResponse = false; };
    proto.tokenizeForEcho = function (text) {
      const normalized = String(text || "").toLowerCase().normalize("NFKC").replace(/[\u0640\u064b-\u065f\u0670]/g, "");
      // Character tokens keep Japanese/Chinese/Korean echoes comparable without spaces.
      return normalized.replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])/gu, " $1 ")
        .split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
    };
    proto.handleBargeInInterruption = function () {
      this._turn = (this._turn || 0) + 1;
      clearTimeout(this.speechSilenceTimer);
      this.cancelTTS();
      this.stopAIGeneration();
      this.stopResponseWatcher();
      this.spokenOffset = 0;
      this.activeAssistantNode = null;
      this.currentTranscript = this.accumulatedTranscript = "";
      this._submitLock = false;
      this.setStatus("listening");
    };
    proto.interrupt = function () {
      this.handleBargeInInterruption();
      this.restartRecognition();
    };
    // Speech is DeepSeek-native (enhancements/deepseek-voice.js). Live never
    // speaks with a browser voice: it pauses its microphone while native audio
    // plays, then hands control back to recognition.
    proto.queueTTS = function () {};
    proto.processTTSQueue = function () {};
    proto.speakUtterance = function () {};
    proto._pauseForNativeSpeech = function () {
      if (!this._liveCurrent() || this._nativePaused) return;
      this._nativePaused = true;
      this._ttsEpoch = (this._ttsEpoch || 0) + 1;
      this.ttsQueue = [];
      clearTimeout(this.speechSilenceTimer);
      clearTimeout(this.restartRecognitionTimer);
      this.restartRecognitionTimer = this.speechSilenceTimer = null;
      this.currentTranscript = this.accumulatedTranscript = "";
      this._detachRecognition();
      this.vadProcessor?._stream?.getAudioTracks().forEach((track) => { track.enabled = false; });
      this.setStatus("speaking");
      this._showNativeResume();
    };
    proto._showNativeResume = function () {
      if (typeof document.createElement !== "function" || typeof document.querySelector !== "function") return;
      if (this._nativeResumeButton && !this._nativeResumeButton.isConnected) this._hideNativeResume();
      if (this._nativeResumeButton) return;
      const top = document.querySelector(".bds-live__top");
      if (!top) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "bds-voice-button bds-native-resume";
      button.textContent = this.speechLang?.startsWith("ar") ? "استئناف الاستماع" : "Resume listening";
      button.addEventListener("click", () => {
        this._hideNativeResume();
        globalThis.BDSDeepSeekVoice?.confirmStopped?.();
      });
      top.insertBefore(button, top.querySelector(".bds-live__close"));
      this._nativeResumeButton = button;
    };
    proto._hideNativeResume = function () {
      this._nativeResumeButton?.remove?.();
      this._nativeResumeButton = null;
    };
    proto._resumeAfterNativeSpeech = function () {
      if (!this._liveCurrent() || !this._nativePaused) return;
      this._nativePaused = false;
      this._hideNativeResume();
      this.vadProcessor?._stream?.getAudioTracks().forEach((track) => { track.enabled = !this.isMuted; });
      this.setStatus(this.isWaitingForResponse ? "thinking" : "listening");
      if (!this.isMuted) this.restartRecognition();
    };
    proto.cancelTTS = function () {
      this._ttsEpoch = (this._ttsEpoch || 0) + 1;
      this.ttsQueue = [];
      this._nativeTurn?.cancel?.();
      return globalThis.BDSDeepSeekVoice?.cancel?.("live-control");
    };
    proto.toggleMute = function () {
      this.isMuted = !this.isMuted;
      state.liveMode.isMuted = this.isMuted;
      if (this.isMuted && this._submitLock) {
        this._turn = (this._turn || 0) + 1;
        this._submitLock = false;
        this.isWaitingForResponse = false;
      }
      this.currentTranscript = this.accumulatedTranscript = "";
      clearTimeout(this.speechSilenceTimer);
      clearTimeout(this.restartRecognitionTimer);
      this.restartRecognitionTimer = null;
      this.vadProcessor?._stream?.getAudioTracks().forEach((track) => { track.enabled = !this.isMuted && !this._nativePaused; });
      if (this.isMuted) { this.cancelTTS(); this._detachRecognition(); }
      else this.restartRecognition();
      this.setStatus(this.isWaitingForResponse ? "thinking" : "listening");
      return this.isMuted;
    };
    proto.stop = function () {
      this._settingsListener?.();
      this._settingsListener = null;
      this._nativeLive?.stop?.("live-ended");
      this._nativeLive = this._nativeTurn = null;
      this._hideNativeResume();
      window.removeEventListener("bds:native-read-status", this._nativeStatusHandler);
      this._nativeStatusHandler = null;
      this._nativePaused = false;
      this._session = (this._session || 0) + 1;
      this._turn = (this._turn || 0) + 1;
      this._detachRecognition();
      window.removeEventListener("pagehide", this._pageHideHandler);
      this._pageHideHandler = null;
      originalStop.call(this);
      this.restartRecognitionTimer = this.speechSilenceTimer = null;
    };
  }

  globalThis.BDSLiveAudio = Object.freeze({ install, splitSpeech, sentenceBoundary: SENTENCE });
})();
