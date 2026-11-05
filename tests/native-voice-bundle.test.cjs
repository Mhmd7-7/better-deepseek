/* node --test tests/native-voice-bundle.test.cjs
 * Executes real shipped bridge code with fake page APIs; never contacts a host.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const content = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
const injected = fs.readFileSync(path.join(root, 'injected.js'), 'utf8');
function section(source, start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `Missing section ${start}`);
  return source.slice(first, last);
}
function bridge(options = {}) {
  const handlers = new Map(), events = [], requests = [];
  class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
  const window = {
    addEventListener(name, fn) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(fn); },
    removeEventListener(name, fn) { handlers.get(name)?.delete(fn); },
    dispatchEvent(event) { events.push(event); for (const fn of [...(handlers.get(event.type) || [])]) fn(event); return true; },
    async fetch(url, init = {}) {
      requests.push({ url: String(url), ...init });
      if (String(url).includes('/auth/ticket')) return new Response(JSON.stringify({ data: { biz_data: { ticket: 'native-ticket' } } }), { headers: { 'content-type': 'application/json' } });
      if (String(url).includes('/history_messages')) {
        if (options.historyThrows) throw new Error('fake history failure');
        return new Response(JSON.stringify({ data: { biz_data: { chat_messages: [] } } }), { status: options.historyStatus || 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('data: {"response_message_id":"m1"}\n\n', { headers: { 'content-type': 'text/event-stream' } });
    },
  };
  class FakeXHR { open() {} send() {} setRequestHeader() {} }
  const localStorage = { length: 0, key() { return null; }, getItem() { return null; }, setItem() {} };
  const context = vm.createContext({
    window, CustomEvent, XMLHttpRequest: FakeXHR, localStorage,
    document: { cookie: '' }, location: { href: 'https://chat.deepseek.com/a/chat/s/s1' },
    Headers, Request, Response, URL, URLSearchParams, TextDecoder,
    console: { warn() {}, error() {} }, Date, setTimeout, clearTimeout,
  });
  vm.runInContext(injected, context);
  const send = async (name, detail) => {
    const event = new CustomEvent(name, { detail: JSON.stringify(detail) });
    for (const fn of [...(handlers.get(name) || [])]) await fn(event);
  };
  const replies = (name) => events.filter((event) => event.type === name).map((event) => JSON.parse(event.detail));
  return { window, requests, send, replies };
}

test('both shipped bundles still parse', () => {
  new vm.Script(content, { filename: 'content.js' });
  new vm.Script(injected, { filename: 'injected.js' });
});

test('the content bundle ships no browser or Android voice synthesizer', () => {
  for (const forbidden of ['speechSynthesis', 'SpeechSynthesisUtterance', '.ttsSpeak(', '.ttsInit(', '.ttsSetVoice(', '.ttsStop(', 'bds:android-tts', 'getVoices()', 'voiceschanged']) {
    assert.equal(content.includes(forbidden), false, `Forbidden local speech reference: ${forbidden}`);
  }
  assert.match(content, /function Pyt\(e\)\{\}/, 'old completion reader remains inert');
  assert.match(content, /globalThis\.BDSVoicePanel/, 'old settings delegate to the native panel');
  assert.match(content, /data-bds-native-voice-settings/, 'native settings launcher remains reachable');
  assert.equal(content.includes('Ot(Rl,21,()=>A(E),tl=>tl.voiceURI'), false, 'old browser voice list renderer is removed');
});

test('the native voice settings launcher delegates to the enhancement panel', () => {
  const code = section(content, 'var MEt=oe=>{', '},IEt=Te(()=>va("subVoice"))') + '};';
  const button = {}, paragraph = {}, root = { querySelector: (name) => name === 'button' ? button : paragraph };
  let click, opened = null, mounted = null;
  const context = vm.createContext({
    Y: () => () => root, X: (fn) => fn(), T: () => 'Voice',
    J: (name, node, handler) => { assert.equal(name, 'click'); assert.equal(node, button); click = handler; },
    N: (anchor, node) => { mounted = node; }, _: { settings: { locale: 'ar' } },
    BDSVoicePanel: { open: (options) => { opened = options; } },
  });
  vm.runInContext(code, context);
  context.MEt({});
  assert.equal(mounted, root);
  assert.equal(button.textContent, 'Voice');
  click();
  assert.equal(opened.locale, 'ar');
});

test('saving unrelated settings never overwrites native panel choices with dormant local state', () => {
  const code = section(content, 'async function Sp(){', '_.settings.preferredLang=A(M).trim()');
  for (const field of ['voiceMode', 'nativeVoice', 'voiceLanguage', 'voiceLanguageChosen', 'voiceURI']) {
    assert.equal(code.includes(`_.settings.${field}=`), false, `${field} belongs to BDSVoicePanel`);
  }
});

test('Android recognition initialization never initializes a TTS engine', () => {
  const code = section(content, 'function qIt(){', 'function GIt(){');
  let attached = 0;
  const window = { addEventListener(name) { assert.equal(name, 'bds:android-stt'); attached++; } };
  const context = vm.createContext({ window, ug: () => ({}), EQ: 'bds:android-stt', y0e() {}, b0e: function Recognition() {}, hF: false });
  vm.runInContext(code, context);
  const result = context.qIt();
  assert.equal(result.tts, false);
  assert.equal(result.stt, true);
  assert.equal(attached, 1);
  assert.equal(typeof window.SpeechRecognition, 'function');
});

test('private TTS transport is absent while history keeps its normalized authorization', async () => {
  const h = bridge();
  await h.window.fetch('/api/v0/chat/completion', { headers: { Authorization: 'Bearer valid-token' } });
  await h.send('bds:request-tts-ticket', { id: 'tts-1', sessionId: 's1' });
  const ticket = h.requests.find((request) => request.url === '/api/v0/auth/ticket');
  assert.equal(ticket, undefined);
  assert.deepEqual(h.replies('bds:tts-ticket'), []);
  assert.equal(content.includes('/api/v0/chat/tts/'), false);
  assert.equal(injected.includes('bds:request-tts-ticket'), false);
  await h.send('bds:request-history-msgs', { id: 'history-1', sessionId: 's1' });
  const history = h.requests.find((request) => request.url.includes('/history_messages'));
  assert.equal(history.headers.Authorization, 'Bearer valid-token');
  const reply = h.replies('bds:history-msgs').at(-1);
  assert.equal(reply.__bdsExplicit, true);
  assert.equal(reply.__bdsRequestId, 'history-1');
  assert.equal(reply.__bdsSessionId, 's1');
});

test('explicit history errors preserve correlation and session metadata', async () => {
  for (const options of [{ historyStatus: 403 }, { historyThrows: true }]) {
    const h = bridge(options);
    await h.send('bds:request-history-msgs', { id: 'history-failed', sessionId: 's2' });
    const [reply] = h.replies('bds:history-msgs-error');
    assert.equal(reply.sessionId, 's2');
    assert.equal(reply.__bdsSessionId, 's2');
    assert.equal(reply.__bdsRequestId, 'history-failed');
    assert.equal(reply.__bdsExplicit, true);
    assert.match(reply.error, /403|fake history failure/);
  }
});

test('XHR observes completion responses even when prompt injection leaves the body unchanged', () => {
  const observed = [];
  class XHR {
    constructor() { this.listeners = new Map(); this.status = 200; this.responseText = 'data: {"response_message_id":"m2"}\n\n'; }
    open(method, url) { this.method = method; this.url = url; }
    send(body) { this.body = body; }
    setRequestHeader() {}
    addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, []); this.listeners.get(name).push(fn); }
    emit(name) { for (const fn of this.listeners.get(name) || []) fn(); }
  }
  const context = vm.createContext({ XMLHttpRequest: XHR, URLSearchParams,
    L: () => ({ changed: false }), Ye: (...args) => observed.push(args), bdsNativeBegin: () => null, bdsNativeEnd() {},
    window: { dispatchEvent() {} }, CustomEvent: function () {}, console,
  });
  vm.runInContext(section(injected, 'function Xe(e,t,n,o){', 'function Ye(e,t,n,o){'), context);
  context.Xe({}, () => true, () => {}, () => {});
  for (const body of [JSON.stringify({ model: 'deepseek', prompt: 'unchanged' }), undefined]) {
    const xhr = new XHR();
    xhr.open('POST', '/api/v0/chat/completion');
    xhr.send(body);
    xhr.emit('load');
    assert.equal(xhr.body, body);
  }
  assert.equal(observed.length, 2);
  assert.equal(observed[0][3], '/api/v0/chat/completion');
});

test('XHR JSON completion responses emit the native assistant ID signal', () => {
  const ids = [];
  const context = vm.createContext({ W: () => true, R: (value) => value.response_message_id, I: (id) => ids.push(id), G() {} });
  vm.runInContext(section(injected, 'function Ye(e,t,n,o){', '(function(){"use strict";const e={configUpdate:'), context);
  context.Ye(JSON.stringify({ response_message_id: 'json-message' }), { getResponseHeader: () => 'application/json' }, null, '/api/v0/chat/completion');
  assert.deepEqual(ids, ['json-message']);
});
