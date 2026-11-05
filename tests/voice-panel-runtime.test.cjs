/* Offline VM tests of the shipped settings panel. No browser, network or audio. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'enhancements/voice-panel.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(setImmediate); };

class FakeNode {
  constructor(name = '') {
    this.name = name;
    this.handlers = new Map();
    this.children = new Map();
    this.dataset = {};
    this.value = '';
    this.textContent = '';
    this.checked = false;
    this.disabled = false;
    this.isConnected = true;
    this.open = false;
    this.focused = 0;
    this.nodes = [];
  }
  addEventListener(name, handler, options) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name).add({ handler, once: options?.once === true });
  }
  removeEventListener(name, handler) {
    const handlers = this.handlers.get(name);
    for (const entry of handlers || []) if (entry.handler === handler) handlers.delete(entry);
  }
  emit(name, extra = {}) {
    for (const entry of [...(this.handlers.get(name) || [])]) {
      if (entry.once) this.handlers.get(name).delete(entry);
      entry.handler({ target: this, stopPropagation() {}, ...extra });
    }
  }
  listenerCount() { return [...this.handlers.values()].reduce((sum, entries) => sum + entries.size, 0); }
  querySelector(selector) { return this.children.get(selector) || null; }
  setAttribute(name, value) { this[name] = String(value); }
  replaceChildren(...nodes) { this.nodes = nodes; }
  append(node) { this.nodes.push(node); node.parentElement = this; }
  insertBefore(node) { this.append(node); if (node.dataset.bdsVoice === '') this.children.set('[data-bds-voice]', node); }
  contains(node) { return node === this || [...this.children.values()].includes(node) || this.nodes.includes(node); }
  getClientRects() { return this.isConnected ? [{}] : []; }
  getBoundingClientRect() { return { left: 0, right: 500, top: 0, bottom: 500 }; }
  focus() { this.focused++; }
  showModal() { this.open = true; }
  close() { this.open = false; this.emit('close'); }
  remove() { this.isConnected = false; }
}

function panel(options = {}) {
  const root = new FakeNode('panel-root');
  const dialog = new FakeNode('dialog');
  for (const selector of ['dialog', '[data-language]', '[data-status]', '[data-auto-read-toggle]',
    '[data-native-support]', '[data-native-status]', '[data-inspect-native]', '[data-close]', 'h2',
    '[data-subtitle]', '[data-listen-title]', '[data-read-title]', '[data-label="language"] > span',
    '[data-language-hint]', '[data-live-hint]', '[data-custom-label]', '[data-apply-language]',
    '[data-read-hint]', '[data-diagnostics]', '[data-custom-language]', '[data-custom-tag]']) {
    root.children.set(selector, selector === 'dialog' ? dialog : new FakeNode(selector));
  }
  const toggleLabel = new FakeNode('toggle-label');
  const toggleParent = new FakeNode('toggle-parent');
  toggleParent.children.set('span', toggleLabel);
  root.querySelector('[data-auto-read-toggle]').parentElement = toggleParent;
  const body = new FakeNode('body');
  const document = new FakeNode('document');
  const window = new FakeNode('window');
  const previousFocus = new FakeNode('previous-focus');
  const livePanel = new FakeNode('live');
  const liveTop = new FakeNode('live-top');
  livePanel.children.set('.bds-live__top', liveTop);
  document.readyState = options.loading ? 'loading' : 'complete';
  document.body = body;
  document.documentElement = { lang: options.locale || 'en' };
  document.activeElement = previousFocus;
  document.getElementById = () => root.isConnected && body.nodes.includes(root) ? root : null;
  document.querySelector = (selector) => selector === '.bds-live' && options.live ? livePanel : null;
  document.querySelectorAll = () => [];
  const allNodes = [root, dialog, ...root.children.values(), body, document, window, livePanel, liveTop, toggleParent];
  document.createElement = (tag) => {
    if (tag === 'div') return root;
    const node = new FakeNode(tag); allNodes.push(node); return node;
  };
  const stored = { bds_settings: { locale: options.locale || 'en', voiceLanguage: 'en-US',
    liveNativeAutoRead: options.autoRead !== false, voiceMode: false, preserved: 'unrelated', ...(options.stored || {}) } };
  const storageListeners = new Set(), subscriptions = new Set(), timers = new Map(), observers = [];
  let nextTimer = 0;
  const calls = { inspect: 0, setAutoRead: [], cancel: 0, playback: 0, unsubscribe: 0, clipboard: null, writes: [] };
  const fireStorage = (next, area = 'local') => {
    stored.bds_settings = { ...next };
    for (const handler of storageListeners) handler({ bds_settings: { newValue: { ...next } } }, area);
  };
  const notify = () => { for (const handler of subscriptions) handler(); };
  const voice = {
    settings: { autoRead: stored.bds_settings.liveNativeAutoRead },
    status: options.status || { code: 'idle' },
    available: () => options.support || { supported: true, missing: [] },
    subscribe(handler) { subscriptions.add(handler); return () => { calls.unsubscribe++; subscriptions.delete(handler); }; },
    async setAutoRead(value) {
      calls.setAutoRead.push(value);
      if (options.saveFails) throw new Error('storage failure');
      voice.settings.autoRead = value === true;
      fireStorage({ ...stored.bds_settings, liveNativeAutoRead: value === true });
      notify();
    },
    inspect() { calls.inspect++; return typeof options.inspect === 'function' ? options.inspect() : options.inspect || { code: 'ready' }; },
    diagnostics: () => ({ enabled: voice.settings.autoRead, status: voice.status.code, transport: 'native-dom' }),
    cancel() { calls.cancel++; },
    speak() { calls.playback++; throw new Error('Playback is forbidden'); },
    probe() { calls.playback++; throw new Error('Historical playback is forbidden'); }
  };
  class MutationObserver {
    constructor(callback) { this.callback = callback; this.active = false; this.disconnected = 0; observers.push(this); }
    observe() { this.active = true; }
    disconnect() { this.active = false; this.disconnected++; }
    emit(records) { if (this.active) this.callback(records); }
  }
  const context = vm.createContext({
    document, window, console, MutationObserver,
    navigator: { language: 'en-US', clipboard: { async writeText(text) { calls.clipboard = text; } } },
    BDSDeepSeekVoice: options.noController ? undefined : voice,
    BDSSpeechLanguages: {
      canonicalize: (value, fallback = 'en-US') => typeof value === 'string' && /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(value) ? value : fallback,
      listOptions: () => [{ value: 'en-US', label: 'English' }, { value: 'ar-SA', label: 'العربية' }, { value: 'fr-FR', label: 'Français' }],
      label: (value) => value
    },
    chrome: { runtime: { getManifest: () => ({ version: 'test' }) }, storage: {
      local: {
        async get() { return { bds_settings: { ...stored.bds_settings } }; },
        async set(patch) { calls.writes.push(patch); fireStorage(patch.bds_settings); }
      },
      onChanged: { addListener: (handler) => storageListeners.add(handler), removeListener: (handler) => storageListeners.delete(handler) }
    } },
    setTimeout: (handler) => { const id = ++nextTimer; timers.set(id, handler); return id; },
    clearTimeout: (id) => timers.delete(id)
  });
  vm.runInContext(source, context, { filename: 'voice-panel.js' });
  const start = async () => { await context.BDSVoicePanel.ready; await flush(); };
  const node = (selector) => root.querySelector(selector);
  const finish = () => window.emit('pagehide');
  return { api: context.BDSVoicePanel, start, root, dialog, node, toggleLabel, calls, voice, stored,
    subscriptions, storageListeners, timers, observers, document, window, previousFocus, liveTop,
    allNodes, fireStorage, notify, finish };
}

function assertSilent(h) {
  assert.equal(h.calls.playback, 0, 'settings must not call speak/probe');
  assert.equal(h.calls.cancel, 0, 'settings must not own or cancel native playback');
}

test('opening the panel reports DOM availability honestly and labels only current Live auto-read', async () => {
  const h = panel({ autoRead: false }); await h.start();
  assert.equal(h.api.open(), true);
  assert.match(h.toggleLabel.textContent, /current Live reply automatically/);
  assert.equal(h.node('[data-auto-read-toggle]').checked, false);
  assert.match(h.node('[data-native-support]').textContent, /Page-inspection APIs/);
  assert.match(h.node('[data-native-support]').textContent, /does not establish voice access for your account/);
  assert.equal(h.node('[data-native-status]').dataset.code, 'idle');
  assert.match(h.node('[data-inspect-native]').textContent, /no playback/);
  assertSilent(h); h.finish();
});

test('inspection uses current controller state only and does not trigger playback', async () => {
  const h = panel({ inspect: { code: 'identity-unverified' } }); await h.start(); h.api.open();
  h.node('[data-inspect-native]').emit('click'); await flush();
  assert.equal(h.calls.inspect, 1);
  assert.equal(h.node('[data-native-status]').dataset.code, 'identity-unverified');
  assert.match(h.node('[data-native-status]').textContent, /no reply will be guessed/);
  assert.equal(h.node('[data-status]').textContent, '');
  assertSilent(h); h.finish();
});

test('an asynchronous inspection is single-flight and errors do not play a fallback', async () => {
  let reject;
  const pending = new Promise((resolve, fail) => { reject = fail; });
  const h = panel({ inspect: () => pending }); await h.start(); h.api.open();
  h.node('[data-inspect-native]').emit('click'); h.node('[data-inspect-native]').emit('click'); await flush();
  assert.equal(h.calls.inspect, 1);
  assert.equal(h.node('[data-inspect-native]').disabled, true);
  reject(new Error('no control')); await flush();
  assert.equal(h.node('[data-inspect-native]').disabled, false);
  assert.match(h.node('[data-status]').textContent, /Could not inspect/);
  assertSilent(h); h.finish();
});

test('auto-read switch delegates to liveNativeAutoRead without changing legacy voiceMode or unrelated data', async () => {
  const h = panel({ autoRead: false }); await h.start(); h.api.open();
  h.node('[data-auto-read-toggle]').checked = true;
  h.node('[data-auto-read-toggle]').emit('change'); await flush();
  assert.deepEqual(h.calls.setAutoRead, [true]);
  assert.equal(h.stored.bds_settings.liveNativeAutoRead, true);
  assert.equal(h.stored.bds_settings.voiceMode, false);
  assert.equal(h.stored.bds_settings.preserved, 'unrelated');
  assert.equal(h.node('[data-auto-read-toggle]').checked, true);
  assertSilent(h); h.finish();
});

test('failed auto-read save restores displayed setting and reports failure', async () => {
  const h = panel({ autoRead: false, saveFails: true }); await h.start(); h.api.open();
  h.node('[data-auto-read-toggle]').checked = true;
  h.node('[data-auto-read-toggle]').emit('change'); await flush();
  assert.equal(h.node('[data-auto-read-toggle]').checked, false);
  assert.equal(h.stored.bds_settings.liveNativeAutoRead, false);
  assert.match(h.node('[data-status]').textContent, /Could not save/);
  assertSilent(h); h.finish();
});

test('language changes preserve native auto-read and external settings refresh the selected language', async () => {
  const h = panel(); await h.start(); h.api.open();
  h.node('[data-language]').value = 'fr-FR'; h.node('[data-language]').emit('change'); await flush();
  assert.equal(h.stored.bds_settings.voiceLanguage, 'fr-FR');
  assert.equal(h.stored.bds_settings.voiceLanguageChosen, true);
  assert.equal(h.stored.bds_settings.liveNativeAutoRead, true);
  assert.equal(h.stored.bds_settings.preserved, 'unrelated');
  h.fireStorage({ ...h.stored.bds_settings, voiceLanguage: 'ar-SA' });
  assert.equal(h.node('[data-language]').value, 'ar-SA');
  assertSilent(h); h.finish();
});

test('controller subscription refreshes current status and arbitrary messages remain plain text', async () => {
  const h = panel(); await h.start(); h.api.open();
  h.voice.status = { code: 'awaiting-completion' }; h.notify();
  assert.equal(h.node('[data-native-status]').dataset.code, 'awaiting-completion');
  assert.match(h.node('[data-native-status]').textContent, /Waiting for the current Live reply/);
  h.voice.status = { code: 'custom', message: '<img src=x onerror=alert(1)>' }; h.notify();
  assert.equal(h.node('[data-native-status]').textContent, '<img src=x onerror=alert(1)>');
  assert.equal(h.node('[data-native-status]').innerHTML, undefined);
  assertSilent(h); h.finish();
});

test('closing and reopening settings never cancels ongoing native playback', async () => {
  const h = panel({ status: { code: 'playing' } }); await h.start(); h.api.open();
  h.node('[data-close]').emit('click');
  assert.equal(h.dialog.open, false);
  assert.equal(h.previousFocus.focused, 1);
  assert.equal(h.subscriptions.size, 1);
  assert.equal(h.api.open(), true);
  assert.equal(h.subscriptions.size, 1, 'reopening does not duplicate controller subscriptions');
  assertSilent(h); h.finish();
});

test('missing DOM APIs or controller disable inspection without claiming account support', async () => {
  for (const options of [{ noController: true }, { support: { supported: false, missing: ['MutationObserver'] } }]) {
    const h = panel(options); await h.start(); h.api.open();
    assert.equal(h.node('[data-inspect-native]').disabled, true);
    assert.equal(h.node('[data-auto-read-toggle]').disabled, true);
    assert.equal(h.node('[data-native-support]').dataset.state, 'missing');
    assert.match(h.node('[data-native-support]').textContent, /did not load|MutationObserver/);
    assertSilent(h); h.finish();
  }
});

test('pagehide removes subscriptions, storage and DOM listeners, observer, pending timer and injected Live button', async () => {
  const h = panel({ live: true }); await h.start(); h.api.open();
  assert.equal(h.storageListeners.size, 1);
  assert.equal(h.subscriptions.size, 1);
  const voiceButton = h.liveTop.querySelector('[data-bds-voice]');
  assert.ok(voiceButton);
  h.observers[0].emit([{ target: new FakeNode('external mutation') }]);
  assert.equal(h.timers.size, 1);
  h.finish();
  assert.equal(h.storageListeners.size, 0);
  assert.equal(h.subscriptions.size, 0);
  assert.equal(h.calls.unsubscribe, 1);
  assert.equal(h.observers[0].disconnected, 1);
  assert.equal(h.timers.size, 0);
  assert.equal(h.root.isConnected, false);
  assert.equal(voiceButton.isConnected, false);
  assert.equal(h.allNodes.reduce((sum, node) => sum + node.listenerCount(), 0), 0);
  assert.equal(h.api.open(), false, 'disposed panel cannot remount after pagehide');
  assertSilent(h);
});

test('pagehide during pending inspection suppresses late UI updates without cancelling native audio', async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const h = panel({ inspect: () => pending }); await h.start(); h.api.open();
  h.node('[data-inspect-native]').emit('click'); await flush();
  h.finish();
  resolve({ code: 'ready' }); await flush();
  assert.equal(h.root.isConnected, false);
  assert.equal(h.subscriptions.size, 0);
  assertSilent(h);
});

test('pagehide before DOMContentLoaded removes deferred mount listener', async () => {
  const h = panel({ loading: true }); await h.start();
  assert.equal(h.document.listenerCount(), 1);
  h.finish();
  assert.equal(h.document.listenerCount(), 0);
  h.document.emit('DOMContentLoaded');
  assert.equal(h.api.open(), false);
  assertSilent(h);
});
