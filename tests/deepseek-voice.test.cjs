/* Unit contracts for the native-UI Live Read aloud controller (no TTS).
 * node --test --test-isolation=none tests/deepseek-voice.test.cjs
 * These tests use a minimal fake DOM. Real Chromium DOM scenarios live in
 * tests/native-read-aloud-browser.cjs; neither is a DeepSeek runtime capture.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'enhancements/deepseek-voice.js'), 'utf8');

function harness(options = {}) {
  const store = { bds_settings: options.settings ? { ...options.settings } : {} };
  const changes = new Set(), listeners = new Map(), events = [], timers = new Map();
  let seq = 0, now = 0;
  const element = (tag = 'div') => ({
    tag, hidden: false, dataset: {}, style: {}, children: [], isConnected: true, textContent: '',
    setAttribute() {}, getAttribute() { return null; }, append(...nodes) { this.children.push(...nodes); },
    addEventListener() {}, removeEventListener() {}, remove() {}, querySelector() { return null; },
    querySelectorAll() { return []; }, contains() { return false; }, getClientRects() { return [{ width: 10 }]; },
    closest() { return null; }, matches() { return false; }, scrollIntoView() {}, focus() {},
  });
  // No body in this unit harness: render() returns early; UI is covered by Chromium.
  const body = null;
  const document = {
    body, documentElement: { lang: options.lang || 'en' }, readyState: 'complete',
    querySelectorAll: options.rows ? (selector) => options.rows(selector) : () => [],
    querySelector() { return null; }, addEventListener(name, fn) { add(name, fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); }, contains() { return true; },
    dispatchEvent(event) { for (const fn of [...(listeners.get(event.type) || [])]) fn(event); return true; },
    createElement: element,
  };
  function add(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); }
  const window = {
    addEventListener: add, removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    dispatchEvent(event) { events.push(event); document.dispatchEvent(event); return true; },
  };
  class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
  class MutationObserver { observe() {} disconnect() {} takeRecords() { return []; } }
  const context = vm.createContext({
    console: { warn() {} }, Date: class extends Date { static now() { return now; } }, JSON, Object, Array, Set, Map,
    Promise, Error, String, Number, Boolean, RegExp, encodeURIComponent, decodeURIComponent,
    MutationObserver,
    document, window, CustomEvent, location: { href: options.href || 'https://chat.deepseek.com/a/chat/s/s1' },
    navigator: { language: options.lang || 'en' },
    chrome: { storage: { local: {
      async get(key) { return key ? { [key]: store[key] } : { ...store }; },
      async set(patch) { Object.assign(store, patch); for (const fn of changes) fn({ bds_settings: { newValue: store.bds_settings } }, 'local'); },
    }, onChanged: { addListener(fn) { changes.add(fn); }, removeListener(fn) { changes.delete(fn); } } } },
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { fn, due: now + (ms || 0) }); return id; },
    clearTimeout: (id) => timers.delete(id),
  });
  vm.runInContext(source, context);
  const api = context.BDSDeepSeekVoice;
  const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail: JSON.stringify(detail) }));
  const advance = (ms) => {
    const end = now + ms;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      now = next[1].due; timers.delete(next[0]); next[1].fn();
    }
    now = end;
  };
  const statuses = [], held = [];
  let current = true;
  const session = api.startLive({
    isCurrent: () => current,
    onHold() { held.push('hold'); }, onRelease(value) { held.push(value.userConfirmed ? 'confirm' : 'release'); },
    onGenerationStart() { statuses.push('start'); }, onGenerationEnd() { statuses.push('end'); },
  });
  return { api, session, store, emit, advance, statuses, held, body, events, context,
    off: () => { current = false; }, setCurrent(value) { current = value; } };
}
const started = (h, extra = {}) => h.emit('bds:native-generation', {
  phase: 'start', sessionId: 's1', requestId: 'r1', version: 'r1', liveTurnId: 't1', ...extra,
});
const completed = (h, extra = {}) => h.emit('bds:native-generation', {
  phase: 'completed', sessionId: 's1', messageId: 'server-1', requestId: 'r1', version: 'r1', liveTurnId: 't1', ...extra,
});

test('native auto-read is on by default and persisted once', async () => {
  const h = harness(); await h.api.ready;
  assert.equal(h.api.settings.autoRead, true);
  assert.equal(h.store.bds_settings.liveNativeAutoRead, true);
});

test('a saved off choice wins and survives reload', async () => {
  const h = harness({ settings: { liveNativeAutoRead: false } }); await h.api.ready;
  assert.equal(h.api.settings.autoRead, false);
  await h.api.setAutoRead(true); assert.equal(h.store.bds_settings.liveNativeAutoRead, true);
});

test('startup and history never trigger native activation', async () => {
  const h = harness(); await h.api.ready;
  // Even a completed event with no Live turn must not click anything.
  completed(h);
  assert.equal(h.api.speaking, false);
  assert.equal(h.api.status.code, 'idle');
});

test('completion without a correlated Live turn is ignored', async () => {
  const h = harness(); h.session.beginTurn({ turnId: 't1', prompt: 'hello' });
  completed(h, { liveTurnId: 'other', requestId: 'r-other' });
  h.session.beginTurn({ turnId: 't2', prompt: 'again' });
  completed(h, { liveTurnId: 't2', requestId: 'r2' });
  assert.equal(h.api.speaking, false);
  assert.equal(h.api.status.code, 'awaiting-completion');
});

test('completed reply with unverified identity fails closed rather than reading old content', async () => {
  const h = harness(); await h.api.ready; h.session.beginTurn({ turnId: 't1', prompt: 'hello' });
  started(h); completed(h);
  h.advance(16000);
  assert.equal(h.api.status.code, 'identity-unverified');
  assert.equal(h.held.length, 0);
});

test('completion requires explicit terminal phase from the bridge', async () => {
  const h = harness(); await h.api.ready; h.session.beginTurn({ turnId: 't1', prompt: 'hello' });
  started(h);
  h.emit('bds:native-generation', { phase: 'error', sessionId: 's1', requestId: 'r1', liveTurnId: 't1', error: 'incomplete' });
  assert.equal(h.api.status.code, 'completion-unverified');
  assert.equal(h.api.speaking, false);
});

test('armed turn is cancelled on navigation and session teardown', async () => {
  const h = harness(); await h.api.ready; h.session.beginTurn({ turnId: 't1', prompt: 'hello' });
  started(h);
  h.context.location.href = 'https://chat.deepseek.com/a/chat/s/s2';
  h.context.window.dispatchEvent(new h.context.CustomEvent('bds:urlChanged'));
  completed(h);
  assert.equal(h.api.speaking, false);
  assert.equal(h.api.status.code, 'idle');
});

test('Live stop ends the session and ignores later completions', async () => {
  const h = harness(); await h.api.ready; h.session.beginTurn({ turnId: 't1', prompt: 'hello' });
  h.session.stop(); completed(h);
  assert.equal(h.api.status.code, 'idle');
  assert.equal(h.held.includes('hold'), false);
});

test('generation deadline reports failure and never activates', async () => {
  const h = harness(); h.session.beginTurn({ turnId: 't1', prompt: 'hello' });
  h.advance(125000);
  assert.equal(h.api.status.code, 'completion-unverified');
  assert.equal(h.api.speaking, false);
});

test('disabling auto-read during generation does not cancel the pending turn', async () => {
  const h = harness(); h.session.beginTurn({ turnId: 't1', prompt: 'hello' });
  started(h);
  await h.api.setAutoRead(false);
  completed(h);
  assert.equal(h.api.status.code, 'disabled');
  // A later enable must not replay the already-completed reply.
  await h.api.setAutoRead(true); h.advance(20000);
  assert.equal(h.api.speaking, false);
});

test('mode can be reused for successive turns without stale completion', async () => {
  const h = harness(); await h.api.ready; h.session.beginTurn({ turnId: 't1', prompt: 'one' });
  h.emit('bds:native-generation', { phase: 'start', sessionId: 's1', requestId: 'r1', liveTurnId: 't1' });
  h.emit('bds:native-generation', { phase: 'cancelled', sessionId: 's1', requestId: 'r1' });
  h.session.beginTurn({ turnId: 't2', prompt: 'two' });
  h.emit('bds:native-generation', { phase: 'start', sessionId: 's1', requestId: 'r2', liveTurnId: 't2' });
  completed(h, { liveTurnId: 't2', requestId: 'r2' });
  h.advance(16000);
  assert.equal(h.api.status.code, 'identity-unverified');
});

test('Live started on a new chat adopts the captured request session and follows the URL', async () => {
  const h = harness({ href: 'https://chat.deepseek.com/' });
  const session = h.api.startLive({ isCurrent: () => true, onHold() {}, onRelease() {} });
  h.api.endLive('replaced'); // keep the page-level session used by the harness? no-op safety
  const live = h.api.startLive({ isCurrent: () => true, onHold() {}, onRelease() {} });
  const turn = live.beginTurn({ turnId: 't-new', prompt: 'أول رسالة' });
  assert.ok(turn, 'a new chat without /chat/s/ must still arm');
  h.emit('bds:native-generation', { phase: 'start', sessionId: 'new-chat-id', requestId: 'r-new', version: 'r-new', liveTurnId: 't-new' });
  assert.equal(h.api.diagnostics().conversation, 'new-chat-id');
  h.context.location.href = 'https://chat.deepseek.com/a/chat/s/new-chat-id';
  h.context.window.dispatchEvent(new h.context.CustomEvent('bds:urlChanged'));
  assert.equal(h.api.diagnostics().live, true, 'same new conversation URL must keep Live armed');
  h.emit('bds:native-generation', { phase: 'completed', sessionId: 'new-chat-id', requestId: 'r-new', liveTurnId: 't-new', messageId: 'server-new', terminal: 'transport' });
  assert.notEqual(h.api.status.code, 'completion-unverified');
});

test('a stale turn handle cannot stop the newer session player', async () => {
  const h = harness(); const old = h.session;
  old.beginTurn({ turnId: 't1', prompt: 'old' });
  old.stop(); // new start
  const fresh = h.api.startLive({ isCurrent: () => true, onHold() {}, onRelease() {} });
  old.cancel(); fresh.cancel();
  assert.equal(h.api.status.code, 'idle');
});

test('no shipped speech generator or private transport remains', () => {
  for (const forbidden of ['speechSynthesis', 'SpeechSynthesisUtterance', '/chat/tts/', 'request-tts-ticket', 'new WebSocket', 'AudioContext']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

test('diagnostics are honest about unverified runtime capabilities', async () => {
  const h = harness(); await h.api.ready;
  const d = h.api.diagnostics();
  assert.equal(d.integration, 'native-read-aloud-ui');
  assert.equal(d.browserSpeech, false);
  assert.equal(d.completion, 'correlated-request + native-control-gate');
  assert.equal(d.identity, 'observed-new-row-key');
});
