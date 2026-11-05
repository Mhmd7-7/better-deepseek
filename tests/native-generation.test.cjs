/* Offline regression tests for the real injected.js generation bridge.
 * Protocol frames below are synthetic: the project has no captured account traffic.
 * Never requests a server or opens a user account.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const injected = fs.readFileSync(path.join(__dirname, '..', 'injected.js'), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function settle() { for (let i = 0; i < 6; i++) await tick(); }
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const sse = (...frames) => frames.map((frame) => `data: ${typeof frame === 'string' ? frame : JSON.stringify(frame)}\n\n`).join('');
const body = (patch = {}) => JSON.stringify({ chat_session_id: 's1', parent_message_id: 4, prompt: 'hello', ...patch });
function page(options = {}) {
  const handlers = new Map(), events = [], requests = [];
  class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
  const window = {
    addEventListener(type, fn) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); },
    removeEventListener(type, fn) { handlers.get(type)?.delete(fn); },
    dispatchEvent(event) { events.push(event); for (const fn of [...(handlers.get(event.type) || [])]) fn(event); return true; },
    async fetch(input, init) {
      requests.push({ input, init });
      if (options.fetch) return options.fetch(input, init);
      return new Response(sse({ response_message_id: 6 }, '[DONE]'), { headers: { 'content-type': 'text/event-stream' } });
    },
  };
  class XHR {
    constructor() { this.handlers = new Map(); this.status = 200; this.responseText = ''; this.responseType = ''; this.readyState = 0; }
    addEventListener(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, new Set()); this.handlers.get(type).add(fn); }
    removeEventListener(type, fn) { this.handlers.get(type)?.delete(fn); }
    emit(type) { for (const fn of [...(this.handlers.get(type) || [])]) fn({ type }); }
    open(method, url) { this.method = method; this.url = url; this.readyState = 1; }
    setRequestHeader() {}
    getResponseHeader() { return this.contentType || 'text/event-stream'; }
    send(value) { this.sent = value; requests.push({ xhr: this, body: value }); if (options.sendThrows) throw new Error('send failed'); }
    abort() { this.emit('abort'); this.emit('loadend'); }
    finish(text, status = 200, contentType = 'text/event-stream') { this.responseText = text; this.status = status; this.contentType = contentType; this.readyState = 4; this.emit('load'); this.emit('loadend'); }
  }
  const context = vm.createContext({ window, XMLHttpRequest: XHR, CustomEvent,
    Headers, Request, Response, URL, URLSearchParams, TextDecoder, TextEncoder,
    AbortController, Date, Math, console: { warn() {}, error() {} }, setTimeout, clearTimeout,
    location: { href: 'https://chat.deepseek.com/a/chat/s/WRONG-URL-SESSION' },
    document: { cookie: '', querySelector() { return null; } },
    localStorage: { length: 0, key() { return null; }, getItem() { return null; }, setItem() {} },
  });
  vm.runInContext(injected, context);
  const dispatch = (type, detail) => window.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify(detail) }));
  return { window, XHR, context, requests, dispatch, events,
    generations: () => events.filter((e) => e.type === 'bds:native-generation').map((e) => JSON.parse(e.detail)),
  };
}

test('native generation bridge parses and no private TTS ticket handler remains', () => {
  new vm.Script(injected);
  assert.equal(injected.includes('bds:request-tts-ticket'), false);
  assert.equal(injected.includes('bds:tts-ticket'), false);
  assert.equal(injected.includes('scope:"tts"'), false);
});

test('Fetch unchanged body starts and completes only at clean EOF with explicit terminal marker', async () => {
  let stream;
  const h = page({ fetch: () => new Response(new ReadableStream({ start(controller) { stream = controller; } }), { headers: { 'content-type': 'text/event-stream' } }) });
  const response = await h.window.fetch('/api/v0/chat/completion', { method: 'POST', body: body() });
  assert.equal(response.status, 200);
  assert.deepEqual(h.generations().map((e) => e.phase), ['start']);
  stream.enqueue(new TextEncoder().encode(sse({ response_message_id: 6 }, '[DONE]')));
  await settle();
  assert.deepEqual(h.generations().map((e) => e.phase), ['start'], 'terminal frame alone does not prove transport completion');
  stream.close(); await settle();
  const [start, done] = h.generations();
  assert.equal(done.phase, 'completed'); assert.equal(start.sessionId, 's1'); assert.equal(done.sessionId, 's1');
  assert.equal(done.messageId, '6'); assert.equal(done.parentMessageId, '4');
  assert.equal(done.requestId, start.requestId); assert.equal(done.version, start.requestId);
  assert.equal(h.requests.length, 1);
});

test('Fetch Request input captures session and parent before injection and navigation', async () => {
  const h = page();
  const request = new Request('https://chat.deepseek.com/api/v0/chat/completion', { method: 'POST', body: body({ chat_session_id: 'request-chat', parent_message_id: 0 }) });
  await h.window.fetch(request); h.context.location.href = 'https://chat.deepseek.com/a/chat/s/new-location'; await settle();
  const done = h.generations().at(-1);
  assert.equal(done.phase, 'completed'); assert.equal(done.sessionId, 'request-chat'); assert.equal(done.parentMessageId, '0');
});

test('clean EOF completes as transport; truncated and malformed SSE still fail', async () => {
  const clean = page({ fetch: () => new Response(sse({ response_message_id: 6 }), { headers: { 'content-type': 'text/event-stream' } }) });
  await clean.window.fetch('/api/v0/chat/completion', { body: body() }); await settle();
  const done = clean.generations().at(-1);
  assert.equal(done.phase, 'completed'); assert.equal(done.terminal, 'transport');
  for (const text of ['data: {"response_message_id":6}\n\ndata: [DONE]', sse({ response_message_id: 6 }) + 'data: {bad}\n\n' + sse('[DONE]')]) {
    const h = page({ fetch: () => new Response(text, { headers: { 'content-type': 'text/event-stream' } }) });
    await h.window.fetch('/api/v0/chat/completion', { body: body() }); await settle();
    assert.equal(h.generations().at(-1).phase, 'error');
  }
});

test('HTTP and application errors never complete even when a terminal marker is present', async () => {
  for (const [status, frames] of [[403, [{ response_message_id: 6 }, '[DONE]']], [200, [{ response_message_id: 6 }, { code: 123, msg: 'rejected' }, '[DONE]']], [200, [{ response_message_id: 6 }, { choices: [{ finish_reason: 'length' }] }, '[DONE]']]]) {
    const h = page({ fetch: () => new Response(sse(...frames), { status, headers: { 'content-type': 'text/event-stream' } }) });
    await h.window.fetch('/api/v0/chat/completion', { body: body() }); await settle();
    assert.equal(h.generations().at(-1).phase, 'error');
    assert.equal(h.generations().some((e) => e.phase === 'completed'), false);
  }
});

test('Fetch rejects once without retrying network failures', async () => {
  const h = page({ fetch: () => { throw new Error('offline'); } });
  await assert.rejects(h.window.fetch('/api/v0/chat/completion', { body: body() }), /offline/); await settle();
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.generations().map((e) => e.phase), ['start', 'error']);
});

test('aborted Fetch before response or midstream emits cancelled, never completed', async () => {
  for (const during of [false, true]) {
    const controller = new AbortController(), pending = deferred(); let stream;
    const h = page({ fetch: () => during ? new Response(new ReadableStream({ start(value) { stream = value; } }), { headers: { 'content-type': 'text/event-stream' } }) : pending.promise });
    const sent = h.window.fetch('/api/v0/chat/completion', { body: body(), signal: controller.signal });
    const expectation = during ? sent : assert.rejects(sent, { name: 'AbortError' });
    await settle();
    if (during) stream.enqueue(new TextEncoder().encode(sse({ response_message_id: 6 })));
    controller.abort();
    if (during) stream.error(new DOMException('Aborted', 'AbortError'));
    else pending.reject(new DOMException('Aborted', 'AbortError'));
    await expectation; await settle();
    assert.deepEqual(h.generations().map((e) => e.phase), ['start', 'cancelled']);
  }
});

test('a clean stream without a terminal marker completes as transport, not explicit', async () => {
  const h = page({ fetch: () => new Response(sse({ response_message_id: 8 }, { p: 'response/status', v: 'FINISHED' }), { headers: { 'content-type': 'text/event-stream' } }) });
  await h.window.fetch('/api/v0/chat/completion', { body: body() }); await settle();
  const done = h.generations().at(-1);
  assert.equal(done.phase, 'completed'); assert.equal(done.terminal, 'transport');
});

test('JSON completion is transport-verified but never labelled explicit', async () => {
  for (const [data, phase] of [[{ response_message_id: 9 }, 'completed'], [{ code: 0, data: { biz_code: 0, biz_data: { response: { message_id: 9, status: 'FINISHED' } } } }, 'completed']]) {
    const h = page({ fetch: () => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } }) });
    await h.window.fetch('/api/v0/chat/edit_message', { body: body({ message_id: 7 }) }); await settle();
    const done = h.generations().at(-1); assert.equal(done.phase, phase); assert.equal(done.kind, 'edit_message');
    assert.equal(done.requestMessageId, '7'); assert.equal(done.userMessageId, null); assert.equal(done.terminal, 'transport');
  }
});

test('XHR unchanged/missing body observes clean load and all cancellation/error paths', () => {
  for (const [action, phase] of [['load', 'completed'], ['abort', 'cancelled'], ['error', 'error'], ['timeout', 'error'], ['http', 'error'], ['incomplete', 'completed']]) {
    const h = page(), xhr = new h.XHR(); xhr.open('POST', '/api/v0/chat/completion'); xhr.send(body());
    if (action === 'load') xhr.finish(sse({ response_message_id: 10 }, '[DONE]'));
    else if (action === 'http') xhr.finish(sse({ response_message_id: 10 }, '[DONE]'), 500);
    else if (action === 'incomplete') xhr.finish(sse({ response_message_id: 10 }));
    else { xhr.emit(action); xhr.emit('loadend'); }
    const [start, done] = h.generations(); assert.equal(start.phase, 'start'); assert.equal(done.phase, phase); assert.equal(done.requestId, start.requestId);
  }
  const h = page(), xhr = new h.XHR(); xhr.open('POST', '/api/v0/chat/completion'); xhr.send(); xhr.finish(sse({ response_message_id: 10 }, '[DONE]'));
  // Reading does not require a server session id: the bound Live row and its
  // native control are the authority. Completion still reports null session.
  assert.equal(h.generations().at(-1).phase, 'completed', 'clean response with assistant id is a transport completion');
  assert.equal(h.generations().at(-1).sessionId, null);
});

test('regeneration/edit requests always have distinct version even when message id is reused', async () => {
  const h = page();
  await h.window.fetch('/api/v0/chat/completion', { body: body() });
  await h.window.fetch('/api/v0/chat/edit_message', { body: body({ message_id: 6 }) }); await settle();
  const starts = h.generations().filter((e) => e.phase === 'start'); assert.equal(starts.length, 2);
  assert.notEqual(starts[0].requestId, starts[1].requestId); assert.equal(starts[1].version, starts[1].requestId);
});

test('response parent/user ids are not mistaken for assistant message id', async () => {
  const h = page({ fetch: () => new Response(sse({ parent_message_id: 5, request_message_id: 7, response_message_id: 9 }, '[DONE]'), { headers: { 'content-type': 'text/event-stream' } }) });
  await h.window.fetch('/api/v0/chat/completion', { body: body() }); await settle();
  assert.equal(h.generations().at(-1).messageId, '9'); assert.equal(h.generations().at(-1).userMessageId, '7');
});

test('a Live arm binds only the exact current prompt and session and exposes no prompt text', async () => {
  const h = page(); h.dispatch('bds:native-live-turn', { turnId: 'turn-1', sessionId: 's1', prompt: 'hello' });
  await h.window.fetch('/api/v0/chat/completion', { body: body({ prompt: 'unrelated' }) });
  await h.window.fetch('/api/v0/chat/completion', { body: body({ chat_session_id: 'other' }) });
  await h.window.fetch('/api/v0/chat/completion', { body: body() }); await settle();
  const starts = h.generations().filter((e) => e.phase === 'start');
  assert.deepEqual(starts.map((e) => e.liveTurnId), [null, null, 'turn-1']);
  for (const event of h.generations()) { assert.equal('prompt' in event, false); assert.equal('text' in event, false); }
});

test('Live arm cancellation and edits cannot consume an armed turn', async () => {
  const h = page(); h.dispatch('bds:native-live-turn', { turnId: 'turn-1', sessionId: 's1', prompt: 'hello' });
  await h.window.fetch('/api/v0/chat/edit_message', { body: body() });
  h.dispatch('bds:native-live-turn', { turnId: 'turn-1', cancel: true });
  await h.window.fetch('/api/v0/chat/completion', { body: body() }); await settle();
  assert.equal(h.generations().some((e) => e.liveTurnId), false);
});

test('Live arming cannot retrospectively capture an earlier in-flight request', async () => {
  const h = page();
  const earlier = h.window.fetch('/api/v0/chat/completion', { body: body() });
  h.dispatch('bds:native-live-turn', { turnId: 'new-turn', sessionId: 's1', prompt: 'hello' });
  await earlier; await settle();
  assert.equal(h.generations()[0].liveTurnId, null);
  await h.window.fetch('/api/v0/chat/completion', { body: body() }); await settle();
  assert.equal(h.generations().filter((e) => e.phase === 'start').at(-1).liveTurnId, 'new-turn');
});

test('Live disarming while request preparation is pending prevents late turn binding', async () => {
  const h = page();
  h.dispatch('bds:native-live-turn', { turnId: 'turn', sessionId: 's1', prompt: 'hello' });
  const pending = h.window.fetch('/api/v0/chat/completion', { body: body() });
  h.dispatch('bds:native-live-turn', { turnId: 'turn', cancel: true });
  await pending; await settle();
  assert.equal(h.generations()[0].liveTurnId, null);
});

test('Live arm matches original prompt even when hidden prompt injection changes the sent body', async () => {
  const h = page();
  h.dispatch('bds:config-update', { systemPrompt: 'Synthetic hidden instruction', systemPromptInjectionFrequency: 'always', disableSystemPrompt: false });
  h.dispatch('bds:native-live-turn', { turnId: 'injected-turn', sessionId: 's1', prompt: 'hello' });
  await h.window.fetch('/api/v0/chat/completion', { body: body() }); await settle();
  assert.equal(h.generations()[0].liveTurnId, 'injected-turn');
  assert.notEqual(JSON.parse(h.requests[0].init.body).prompt, 'hello');
});

test('a new-chat arm with no session binds by exact prompt and adopts the request session', async () => {
  const h = page();
  h.dispatch('bds:native-live-turn', { turnId: 'live-new', sessionId: '', prompt: 'first message' });
  await h.window.fetch('/api/v0/chat/completion', { body: JSON.stringify({ parent_message_id: 0, prompt: 'first message' }) }); await settle();
  const done = h.generations().at(-1);
  assert.equal(done.phase, 'completed');
  assert.equal(done.liveTurnId, 'live-new');
  assert.equal(done.sessionId, null);
});

test('exact latest user message and id are captured for evidenced messages-array payloads', async () => {
  const h = page();
  h.dispatch('bds:native-live-turn', { turnId: 'array-turn', sessionId: 's1', prompt: 'hello' });
  await h.window.fetch('/api/v0/chat/completion', { body: JSON.stringify({ chat_session_id: 's1', messages: [{ role: 'user', message_id: 0, content: 'hello' }] }) }); await settle();
  assert.equal(h.generations()[0].liveTurnId, 'array-turn');
  assert.equal(h.generations()[0].userMessageId, '0');
});

test('arbitrary user or parent message ids never authorize correlated completion', async () => {
  for (const data of [{ message_id: 7 }, { role: 'USER', message_id: 7 }, { response: { parent_message_id: 7 } }]) {
    const h = page({ fetch: () => new Response(sse(data, '[DONE]'), { headers: { 'content-type': 'text/event-stream' } }) });
    await h.window.fetch('/api/v0/chat/completion', { body: body() }); await settle();
    assert.equal(h.generations().at(-1).phase, 'error');
    assert.equal(h.generations().at(-1).messageId, null);
    assert.equal(h.generations().at(-1).error, 'uncorrelated');
  }
});

test('parallel requests retain original session/version and independent completion outcomes', async () => {
  const streams = [];
  const h = page({ fetch: () => new Response(new ReadableStream({ start(controller) { streams.push(controller); } }), { headers: { 'content-type': 'text/event-stream' } }) });
  await h.window.fetch('/api/v0/chat/completion', { body: body({ chat_session_id: 'a' }) });
  await h.window.fetch('/api/v0/chat/completion', { body: body({ chat_session_id: 'b' }) });
  streams[1].enqueue(new TextEncoder().encode(sse({ response_message_id: 8 }, '[DONE]'))); streams[1].close();
  streams[0].enqueue(new TextEncoder().encode(sse({ response_message_id: 7 }))); streams[0].close(); await settle();
  const events = h.generations(), starts = events.filter((e) => e.phase === 'start');
  assert.notEqual(starts[0].requestId, starts[1].requestId);
  const a = events.find((e) => e.phase !== 'start' && e.sessionId === 'a'), b = events.find((e) => e.phase !== 'start' && e.sessionId === 'b');
  assert.equal(a.phase, 'completed'); assert.equal(a.terminal, 'transport'); assert.equal(b.phase, 'completed'); assert.equal(b.terminal, 'explicit');
  assert.equal(a.requestId, starts[0].requestId); assert.equal(b.requestId, starts[1].requestId);
});

test('SSE framing tolerates split UTF-8/CRLF frames but rejects data after terminal', async () => {
  let stream;
  const h = page({ fetch: () => new Response(new ReadableStream({ start(controller) { stream = controller; } }), { headers: { 'content-type': 'text/event-stream' } }) });
  await h.window.fetch('/api/v0/chat/completion', { body: body() });
  const encoded = new TextEncoder().encode(sse({ response_message_id: 8, content: 'أهلاً' }, '[DONE]').replace(/\n/g, '\r\n'));
  for (let i = 0; i < encoded.length; i += 3) stream.enqueue(encoded.slice(i, i + 3));
  stream.close(); await settle(); assert.equal(h.generations().at(-1).phase, 'completed');
  const extra = page({ fetch: () => new Response(sse({ response_message_id: 8 }, '[DONE]', { response_message_id: 9 }), { headers: { 'content-type': 'text/event-stream' } }) });
  await extra.window.fetch('/api/v0/chat/completion', { body: body() }); await settle();
  assert.equal(extra.generations().at(-1).phase, 'error');
});

test('conflicting response message ids fail closed instead of selecting a different assistant', async () => {
  const h = page({ fetch: () => new Response(sse({ response_message_id: 8 }, { response_message_id: 9 }, '[DONE]'), { headers: { 'content-type': 'text/event-stream' } }) });
  await h.window.fetch('/api/v0/chat/completion', { body: body() }); await settle();
  assert.equal(h.generations().at(-1).phase, 'error');
  assert.equal(h.generations().at(-1).error, 'ambiguous-message');
});

test('XHR preparation errors preserve request and native sync send error never retries', () => {
  const h = page({ sendThrows: true }), xhr = new h.XHR(); xhr.open('POST', '/api/v0/chat/completion');
  assert.throws(() => xhr.send(body()), /send failed/);
  assert.equal(h.requests.length, 1); assert.deepEqual(h.generations().map((e) => e.phase), ['start', 'error']);
});

test('history remains separate and private speech ticket events do nothing', async () => {
  const h = page({ fetch: () => new Response(JSON.stringify({ data: { biz_data: { chat_messages: [] } } }), { headers: { 'content-type': 'application/json' } }) });
  h.dispatch('bds:request-history-msgs', { id: 'history', sessionId: 's1' }); await settle();
  const history = h.events.filter((e) => e.type === 'bds:history-msgs').map((e) => JSON.parse(e.detail));
  assert.equal(history.at(-1).__bdsRequestId, 'history'); assert.equal(h.generations().length, 0);
  const count = h.requests.length; h.dispatch('bds:request-tts-ticket', { id: 'tts' }); await settle();
  assert.equal(h.requests.length, count);
});
