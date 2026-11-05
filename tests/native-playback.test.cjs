/* Offline tests for the page-context native playback observer.
 * Synthetic media only; no site, account, microphone or audio output.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'injected.js'), 'utf8');
const marker = '/* Native media lifecycle observer (page context).';
const observer = source.slice(source.indexOf(marker));

function harness() {
  const events = [], handlers = new Map();
  class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
  const window = {
    addEventListener(name, fn) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(fn); },
    removeEventListener(name, fn) { handlers.get(name)?.delete(fn); },
    dispatchEvent(event) { if (event.type === 'bds:native-playback') events.push(JSON.parse(event.detail)); for (const fn of [...(handlers.get(event.type) || [])]) fn(event); return true; },
  };
  class HTMLMediaElement {
    constructor() { this.listeners = new Map(); }
    addEventListener(name, fn) { this.listeners.set(name, fn); }
    play() { return Promise.resolve(); }
    fire(name) { this.listeners.get(name)?.(); }
  }
  class AudioBufferSourceNode {
    constructor() { this.listeners = new Map(); }
    addEventListener(name, fn) { this.listeners.set(name, fn); }
    start() {}
    fire(name) { this.listeners.get(name)?.(); }
  }
  window.HTMLMediaElement = HTMLMediaElement;
  window.AudioBufferSourceNode = AudioBufferSourceNode;
  const document = { addEventListener() {} };
  const context = vm.createContext({ window, document, CustomEvent, Date, setTimeout, clearTimeout, Promise, Object, JSON, Set });
  vm.runInContext(observer, context);
  const dispatch = (type, detail) => window.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify(detail) }));
  return { window, events, dispatch, HTMLMediaElement, AudioBufferSourceNode };
}
const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

test('no arm means unrelated media playback is not reported', async () => {
  const h = harness();
  const media = new h.HTMLMediaElement();
  await media.play();
  media.fire('ended');
  assert.deepEqual(h.events, []);
});

test('media playback after an arm reports one start and one end', async () => {
  const h = harness();
  h.dispatch('bds:native-playback-arm', { turnId: 't1' });
  const media = new h.HTMLMediaElement();
  await media.play();
  media.fire('ended');
  assert.deepEqual(h.events.map((event) => event.state), ['start', 'end']);
  assert.ok(h.events.every((event) => event.turnId === 't1' && event.kind === 'media'));
});

test('armed Web Audio chunks report start once and end after the last chunk', async () => {
  const h = harness();
  h.dispatch('bds:native-playback-arm', { turnId: 't2' });
  const first = new h.AudioBufferSourceNode(), second = new h.AudioBufferSourceNode();
  first.start(); second.start();
  first.fire('ended');
  await settle(50);
  assert.deepEqual(h.events.map((event) => event.state), ['start'], 'a chunk gap must not end playback');
  second.fire('ended');
  await settle(1400);
  assert.deepEqual(h.events.map((event) => event.state), ['start', 'end']);
  assert.ok(h.events.every((event) => event.kind === 'webaudio'));
});

test('a new arm resets previous media attribution', async () => {
  const h = harness();
  h.dispatch('bds:native-playback-arm', { turnId: 'old' });
  const oldMedia = new h.HTMLMediaElement(); await oldMedia.play();
  h.dispatch('bds:native-playback-arm', { turnId: 'new' });
  const fresh = new h.HTMLMediaElement(); await fresh.play();
  fresh.fire('ended');
  assert.deepEqual(h.events.map((event) => [event.turnId, event.state]), [['old', 'start'], ['new', 'start'], ['new', 'end']]);
});
