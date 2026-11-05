/* Run with: node --test --test-isolation=none tests/live-audio.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const bundle = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
const helper = fs.readFileSync(path.join(root, 'enhancements/live-audio.js'), 'utf8');
const engineSource = bundle.slice(bundle.indexOf('class mCt{'), bundle.indexOf('globalThis.BDSLiveAudio.install(mCt,'));
const vadSource = bundle.slice(bundle.indexOf('class DV{'), bundle.indexOf('function MV(e,t)'));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

function harness(options = {}) {
  let now = 10000, next = 1, node = null, generating = false;
  const timers = new Map(), recognizers = [], utterances = [], sends = [], toasts = [], contexts = [], streams = [];
  const listeners = new Map();
  const state = { settings: { voiceLanguage: 'ar-SA', vadSilenceTimeout: 700 }, liveMode: { active: false, status: 'idle' }, ui: { showToast: (text) => toasts.push(text) } };
  const setTimer = (fn, delay, repeat = false) => { const id = next++; timers.set(id, { fn, due: now + delay, delay, repeat }); return id; };
  const clearTimer = (id) => timers.delete(id);
  const advance = (ms) => {
    const end = now + ms;
    for (;;) {
      const entry = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!entry) break;
      const [id, timer] = entry;
      now = timer.due;
      if (timer.repeat) timer.due += timer.delay; else timers.delete(id);
      timer.fn();
    }
    now = end;
  };
  function createStream() {
    const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
    const stream = { track, getTracks: () => [track], getAudioTracks: () => [track] };
    streams.push(stream); return stream;
  }
  class Context {
    constructor() { this.state = options.suspended ? 'suspended' : 'running'; this.sampleRate = 48000; contexts.push(this); }
    async resume() { if (options.resume) await options.resume(); this.state = 'running'; }
    async close() { this.state = 'closed'; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createAnalyser() { return { fftSize: 1024, frequencyBinCount: 512, getByteTimeDomainData: (data) => data.fill(128), getByteFrequencyData: (data) => data.fill(0) }; }
  }
  class Recognition {
    constructor() { recognizers.push(this); }
    start() { if (options.recognitionThrow) throw Object.assign(new Error('start failed'), { name: options.recognitionThrow }); this.onstart?.(); }
    abort() { this.aborted = true; this.onend?.(); }
    result(...parts) {
      const results = parts.map((part) => Object.assign([{ transcript: typeof part === 'string' ? part : part.text }], { isFinal: typeof part === 'string' ? true : !!part.final }));
      this.onresult?.({ resultIndex: 0, results });
    }
  }
  const synth = {
    speaking: false, paused: false, cancelled: 0, voices: new Set(), onvoiceschanged: null,
    getVoices: () => options.browserVoices || [{name:'Arabic test',lang:'ar-SA',voiceURI:'ar-test',localService:true}], resume() {}, pause() {},
    addEventListener(type, fn) { this.voices.add(fn); }, removeEventListener(type, fn) { this.voices.delete(fn); },
    speak(utterance) { if (options.speakThrow) throw new Error('synth failure'); utterances.push(utterance); this.speaking = true; utterance.onstart?.(); },
    cancel() { this.cancelled++; this.speaking = false; },
  };
  const window = {
    SpeechRecognition: options.unsupported ? undefined : Recognition, AudioContext: Context, speechSynthesis: synth,
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatchEvent(event) { for (const fn of listeners.get(event.type) || []) fn(event); return true; },
  };
  const storageListeners = new Set();
  const chrome = { storage: { onChanged: {
    addListener(fn) { storageListeners.add(fn); },
    removeListener(fn) { storageListeners.delete(fn); },
  } } };
  const nativeCancels = { count: 0 }, native = { options: null, turns: [], stopped: 0 };
  const sandbox = {
    chrome,
    BDSDeepSeekVoice: {
      cancel() { nativeCancels.count++; native.options?.onGenerationEnd?.({ phase: 'cancelled' }); return { safe: true }; },
      startLive(options) {
        native.options = options;
        return {
          beginTurn(value) { native.turns.push(value); return { cancel() { nativeCancels.count++; options.onGenerationEnd({ phase: 'cancelled' }); } }; },
          stop() { native.stopped++; },
        };
      },
    },
    console, window, navigator: { language: 'ar-SA', mediaDevices: { getUserMedia: () => options.microphone ? options.microphone() : Promise.resolve(createStream()) } },
    document: { contains: (value) => value.isConnected, querySelectorAll: () => node ? [node] : [] },
    Date: class extends Date { static now() { return now; } }, performance: { now: () => now },
    setTimeout: (fn, delay = 0) => setTimer(fn, delay), clearTimeout: clearTimer,
    setInterval: (fn, delay) => setTimer(fn, delay, true), clearInterval: clearTimer,
    requestAnimationFrame: (fn) => { const id = next++; return id; }, cancelAnimationFrame() {},
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    _: state, Fr() {}, OX() {}, Ue() {},
    fCt: 400, ACt: 900, w0e: 4, pCt: 0.34, hCt: 0.85, gCt: 0.95, dCt: () => false,
    cJ: () => { if (options.voiceThrow) throw new Error('voice unavailable'); return null; },
    lJ: (value) => String(value).replace(/^[\s.,!؟?()]+$/gu, '').trim(), oJ: (value) => String(value),
    Mb: (value) => value.text || '', Wb: () => node,
    pB: () => generating ? { click() { generating = false; } } : null, Yo: () => generating,
    MV: (a, b) => (a + b) / 2,
    Na: async (text, label, current) => { if (current()) sends.push(text); return true; },
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root,'enhancements/speech-languages.js'),'utf8'), context);
  vm.runInContext(helper, context);
  vm.runInContext(`${vadSource}\n${engineSource}\nBDSLiveAudio.install(mCt, { state: _, VAD: DV, sendPrompt: (...args) => globalThis.testSend(...args), prepare: OX, pushConfig: Fr, cleanSpeech: lJ, log: Ue }); globalThis.engine = new mCt();`, context);
  context.testSend = options.send || sandbox.Na;
  const engine = context.engine;
  return { engine, context, state, streams, createStream, contexts, recognizers, utterances, sends, timers, synth, toasts, listeners, advance, storageListeners, nativeCancels, native,
    emitSettings(value) { for (const fn of storageListeners) fn({ bds_settings: { newValue: value } }, 'local'); },
    speech(playing) { if (playing) native.options?.onHold(); else native.options?.onRelease({ verified: true }); },
    assistant(text) {
      node = { text, isConnected: true, textContent: text, closest: () => null, querySelector: () => null, getAttribute: () => null };
      return node;
    },
    generation(value) { generating = value; },
  };
}

async function start(h) { const result = await h.engine.start(); assert.equal(result.supported, true); }


test('changing Live language clears old speech and restarts recognition in the selected locale', async () => {
  const h = harness(); await start(h);
  h.engine.recognition.result('نص قديم'); const old = h.engine.recognition;
  h.state.settings.voiceLanguage = 'ja-JP'; h.emitSettings({ voiceLanguage: 'ja-JP' });
  assert.equal(old.aborted, true); assert.equal(h.engine.speechLang, 'ja-JP');
  assert.equal(h.engine.recognition.lang, 'ja-JP'); assert.equal(h.engine.currentTranscript, '');
  h.engine.stop();
});

test('Live never speaks with a browser voice', async () => {
  const h = harness(); await start(h);
  h.engine.speakChunk('رد'); h.engine.queueTTS('رد آخر');
  h.advance(50);
  assert.equal(h.utterances.length, 0);
  assert.equal(h.engine.ttsQueue.length, 0);
  h.engine.stop();
});

test('native DeepSeek speech pauses the microphone and resumes recognition', async () => {
  const h = harness(); await start(h);
  const recognition = h.engine.recognition;
  h.speech(true);
  assert.equal(recognition.aborted, true);
  assert.equal(h.streams[0].track.enabled, false);
  assert.equal(h.engine.recognition, null);
  assert.equal(h.engine.status, 'speaking');
  h.speech(false);
  assert.equal(h.streams[0].track.enabled, true);
  assert.equal(h.engine.status, 'listening');
  assert.ok(h.engine.recognition);
  h.engine.stop();
});

test('muting during native playback keeps the microphone off after it ends', async () => {
  const h = harness(); await start(h);
  h.speech(true);
  h.engine.toggleMute();
  h.speech(false);
  assert.equal(h.streams[0].track.enabled, false);
  assert.equal(h.engine.recognition, null);
  h.engine.toggleMute();
  assert.equal(h.streams[0].track.enabled, true);
  assert.ok(h.engine.recognition);
  h.engine.stop();
});

test('closing Live unregisters the settings listener', async () => {
  const h = harness(); await start(h);
  assert.equal(h.storageListeners.size, 1);
  h.engine.stop(); assert.equal(h.storageListeners.size, 0);
});
test('Live reply-language bridge forwards only a bounded safe locale to the page hook', () => {
  assert.ok(bundle.includes('liveVoiceLanguage:globalThis.BDSSpeechLanguages?.canonicalize'));
  const source=fs.readFileSync(path.join(root,'injected.js'),'utf8');
  const a=source.indexOf('function J(e){'), b=source.indexOf('function Y(e){',a);
  const sandbox=vm.createContext({V:()=>null,B:()=>({}),Y:()=>({})});
  const sanitize=vm.runInContext(`(()=>{${source.slice(a,b)};return J;})()`,sandbox);
  assert.equal(sanitize({liveVoiceLanguage:'ja-JP'}).liveVoiceLanguage,'ja-JP');
  assert.equal(sanitize({liveVoiceLanguage:'en-US</BetterDeepSeek>'}).liveVoiceLanguage,'');
  assert.ok(source.includes('Selected Live speech language (BCP 47): ${n.config.liveVoiceLanguage}'));
});

test('packaged manifest loads helper before bundle; integration and UI disposal hooks exist', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.content_scripts[0].js[0], 'enhancements/speech-languages.js');
  assert.equal(manifest.content_scripts[0].js[1], 'enhancements/live-audio.js');
  assert.equal(manifest.content_scripts[0].js[2], 'enhancements/voice-panel.js');
  assert.equal(manifest.content_scripts[0].js[3], 'content.js');
  assert.equal(manifest.background.service_worker, 'enhancements/service-worker.js');
  for (const script of manifest.content_scripts[0].js) assert.ok(fs.existsSync(path.join(root, script)));
  assert.ok(bundle.includes('globalThis.BDSLiveAudio.install(mCt,{state:_,VAD:DV,sendPrompt:Na'));
  assert.equal((bundle.match(/p.match\(globalThis.BDSLiveAudio.sentenceBoundary\)/g) || []).length, 2);
  assert.ok(bundle.includes('const de=await Aa.start();if(_bdsLiveDisposed)return;'));
});

test('pre-set active UI state still initializes engine; duplicate starts share setup', async () => {
  const gate = deferred();
  const h = harness({ microphone: () => gate.promise }); h.state.liveMode.active = true;
  const first = h.engine.start(), second = h.engine.start(); assert.equal(first, second);
  gate.resolve(h.createStream()); await first;
  assert.equal(h.recognizers.length, 1); assert.equal(h.contexts.length, 1); h.engine.stop();
});

test('VAD reuses analyser buffers rather than allocating them each frame', async () => {
  const h = harness(); await start(h);
  const vad = h.engine.vadProcessor; const time = vad._bdsTimeData, frequency = vad._bdsFrequencyData;
  vad._processFrame();
  assert.equal(vad._bdsTimeData, time); assert.equal(vad._bdsFrequencyData, frequency); h.engine.stop();
});

test('unsupported recognition does not activate mode or acquire microphone', async () => {
  const h = harness({ unsupported: true });
  assert.equal((await h.engine.start()).supported, false);
  assert.equal(h.state.liveMode.active, false);
  assert.equal(h.streams.length, 0);
});

test('close while microphone permission is pending disposes late stream and recognition', async () => {
  const gate = deferred();
  const h = harness({ microphone: () => gate.promise });
  const pending = h.engine.start();
  const recognition = h.recognizers[0];
  h.engine.stop();
  const stream = h.createStream(); gate.resolve(stream);
  assert.equal((await pending).cancelled, true);
  assert.equal(stream.track.stopped, true);
  assert.equal(recognition.aborted, true);
  assert.equal(h.contexts.length, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.synth.voices.size, 0);
});

test('close and reopen isolates late permission result from the new session', async () => {
  const gate = deferred(); let calls = 0;
  const h = harness({ microphone: () => ++calls === 1 ? gate.promise : Promise.resolve(h.createStream()) });
  const previous = h.engine.start(); h.engine.stop(); await start(h);
  const stream = h.createStream(); gate.resolve(stream); await previous;
  assert.equal(stream.track.stopped, true);
  assert.equal(h.state.liveMode.active, true);
  assert.equal(h.engine.recognition, h.recognizers.at(-1));
  assert.equal(h.streams[0].track.stopped, false);
  h.engine.stop(); assert.equal(h.timers.size, 0);
});

test('muting before microphone permission resolves disables the late track immediately', async () => {
  const gate = deferred();
  const h = harness({ microphone: () => gate.promise });
  const pending = h.engine.start(); h.engine.toggleMute();
  const stream = h.createStream(); gate.resolve(stream); await pending;
  assert.equal(stream.track.enabled, false);
  assert.equal(h.engine.recognition, null);
  h.engine.toggleMute(); assert.equal(stream.track.enabled, true); h.engine.stop();
});

test('microphone denial stops recognition and releases pending session resources', async () => {
  const h = harness({ microphone: () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })) });
  assert.equal((await h.engine.start()).supported, false);
  assert.equal(h.state.liveMode.active, false); assert.equal(h.recognizers[0].aborted, true);
  assert.equal(h.timers.size, 0); assert.equal(h.synth.voices.size, 0);
});

test('close during suspended AudioContext resume releases stream and context', async () => {
  const gate = deferred(), entered = deferred();
  const h = harness({ suspended: true, resume: () => { entered.resolve(); return gate.promise; } });
  const pending = h.engine.start(); await entered.promise;
  h.engine.stop(); gate.resolve(); await pending;
  assert.equal(h.streams[0].track.stopped, true);
  assert.equal(h.contexts[0].state, 'closed');
  assert.equal(h.engine.vadProcessor, null);
});

test('restarting recognizer preserves current turn; repeated final events do not postpone silence', async () => {
  const h = harness(); await start(h);
  const first = h.recognizers[0]; first.result('مرحبا'); h.advance(300); first.onend(); h.advance(150);
  const second = h.recognizers.at(-1); second.result('كيف حالك');
  assert.equal(h.engine.currentTranscript, 'مرحبا كيف حالك');
  h.advance(500); second.result('كيف حالك'); h.advance(200);
  assert.equal(h.sends[0], 'مرحبا كيف حالك');
  h.engine.stop();
});

test('genuine single-result barge-in preserves triggering words and sends only once', async () => {
  const h = harness(); await start(h);
  await h.engine.submitUserPrompt('سؤال قديم');
  h.engine.speakChunk('رد سابق بعيد عن طلب المستخدم'); h.advance(500);
  const recognition = h.engine.recognition;
  recognition.result('غيّر الموضوع الآن');
  assert.equal(h.engine.status, 'listening');
  assert.equal(h.engine.currentTranscript, 'غيّر الموضوع الآن');
  h.advance(700); await Promise.resolve();
  assert.deepEqual(h.sends, ['سؤال قديم', 'غيّر الموضوع الآن']);
  h.engine.stop();
});

test('native playback keeps recognition off until it ends', async () => {
  const h = harness(); await start(h);
  h.speech(true);
  h.advance(1000);
  assert.equal(h.engine.recognition, null);
  assert.equal(h.recognizers.length, 1);
  h.speech(false);
  assert.equal(h.recognizers.length, 2);
  h.engine.stop();
});

test('mute cancels native speech', async () => {
  const h = harness(); await start(h);
  h.speech(true);
  const before = h.nativeCancels.count;
  h.engine.toggleMute();
  assert.equal(h.nativeCancels.count, before + 1);
  h.engine.stop();
});

test('closing Live cancels native speech and removes its listener', async () => {
  const h = harness(); await start(h);
  h.speech(true);
  const before = h.nativeCancels.count;
  h.engine.stop();
  assert.ok(h.nativeCancels.count > before);
  assert.equal(h.storageListeners.size, 0);
  h.speech(false);
  assert.equal(h.engine.recognition, null);
});

test('mute drops pending transcript, old callbacks and muted output; resumes with fresh input', async () => {
  const h = harness(); await start(h);
  const recognition = h.engine.recognition; const stale = recognition.onresult;
  recognition.result('كلام قبل الكتم');
  h.engine.toggleMute(); h.advance(1000); h.engine.queueTTS('يجب تجاهل هذا الرد');
  assert.equal(h.streams[0].track.enabled, false); assert.equal(h.sends.length, 0); assert.equal(h.engine.ttsQueue.length, 0);
  h.engine.toggleMute();
  stale({ results: [[{ transcript: 'حدث قديم' }]] });
  assert.equal(h.engine.currentTranscript, '');
  h.engine.recognition.result('كلام جديد'); h.advance(700);
  assert.deepEqual(h.sends, ['كلام جديد']); assert.equal(h.streams[0].track.enabled, true); h.engine.stop();
});

test('permission denied stops instead of restarting; pending microphone is also disposed', async () => {
  const h = harness(); await start(h);
  const recognition = h.engine.recognition; const staleEnd = recognition.onend;
  recognition.onerror({ error: 'not-allowed' }); staleEnd(); h.advance(5000);
  assert.equal(h.state.liveMode.active, false); assert.equal(h.recognizers.length, 1);
  assert.equal(h.streams[0].track.stopped, true); assert.equal(h.toasts.length, 1);
});

test('network restart keeps backoff when onend follows onerror and stops after bounded failures', async () => {
  const h = harness(); await start(h);
  const recognition = h.engine.recognition;
  recognition.onerror({ error: 'network' }); recognition.onend(); h.advance(150);
  assert.equal(h.recognizers.length, 1); h.advance(150); assert.equal(h.recognizers.length, 2);
  for (let index = 0; index < 5; index++) { h.engine.recognition.onerror({ error: 'network' }); h.advance(3000); }
  assert.equal(h.state.liveMode.active, false); assert.equal(h.timers.size, 0);
});

test('synchronous recognition start exceptions cannot retry forever', async () => {
  const h = harness({ recognitionThrow: 'InvalidStateError' }); await start(h); h.advance(20000);
  assert.equal(h.recognizers.length, 6); assert.equal(h.state.liveMode.active, false); assert.equal(h.timers.size, 0);
});

test('deferred prompt is cancelled by stop, interruption, or mute before actual send', async () => {
  for (const action of ['stop', 'interrupt', 'toggleMute']) {
    const gate = deferred(); let sent = false;
    const h = harness({ send: async (text, label, current) => { await gate.promise; if (current()) sent = true; return current(); } });
    await start(h); const pending = h.engine.submitUserPrompt('طلب مؤجل'); h.engine[action](); gate.resolve(); await pending;
    assert.equal(sent, false, action); assert.equal(h.engine.responseWatchTimer, null, action);
    assert.equal(h.engine.isWaitingForResponse, false, action); h.engine.stop();
  }
});

test('an old pending prompt cannot arm a watcher in a newer reopened session', async () => {
  const gate = deferred(); let sent = false;
  const h = harness({ send: async (text, label, current) => { await gate.promise; sent = current(); return sent; } });
  await start(h); const pending = h.engine.submitUserPrompt('قديم'); h.engine.stop(); await start(h);
  gate.resolve(); await pending;
  assert.equal(sent, false); assert.equal(h.engine.responseWatchTimer, null); assert.equal(h.engine.status, 'listening'); h.engine.stop();
});

test('send failure releases waiting state; completion is driven by the native controller, not a text timer', async () => {
  const failed = harness({ send: async () => false }); await start(failed); await failed.engine.submitUserPrompt('فشل');
  assert.equal(failed.engine.isWaitingForResponse, false); assert.equal(failed.engine.status, 'listening'); failed.engine.stop();
  // The old response watcher (text inactivity) is intentionally disabled for
  // Live: arming a turn must not start a completion timer of its own.
  const h = harness(); await start(h); await h.engine.submitUserPrompt('لا يوجد رد');
  assert.equal(h.engine.responseWatchTimer, null);
  h.native.options.onGenerationEnd({ phase: 'error' });
  assert.equal(h.engine.isWaitingForResponse, false);
  assert.equal(h.engine.status, 'listening'); h.engine.stop();
});

test('streamed reply text is never synthesized by the Live engine', async () => {
  const h = harness(); await start(h); await h.engine.submitUserPrompt('سؤال'); h.generation(true);
  h.assistant('هذا جواب واضح ومختصر؟'); h.advance(50);
  assert.equal(h.utterances.length, 0);
  const chunks = h.context.BDSLiveAudio.splitSpeech('كلمات عربية '.repeat(100));
  assert.ok(chunks.length > 1); assert.ok(chunks.every((chunk) => chunk.length <= 220)); h.engine.stop();
});
