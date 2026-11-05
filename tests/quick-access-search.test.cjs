/* Run with: node --test tests/quick-access-search.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const toolsSource = fs.readFileSync(path.join(root, 'enhancements/conversation-tools.js'), 'utf8');
const quickAccessSource = fs.readFileSync(path.join(root, 'enhancements/quick-access.js'), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function tools(messages = []) {
  const document = { querySelectorAll: () => messages };
  const context = vm.createContext({ document, TextEncoder, Node: { ELEMENT_NODE: 1 },
    location: { href: 'https://chat.deepseek.com/a/chat/s/test' } });
  vm.runInContext(toolsSource, context, { filename: 'conversation-tools.js' });
  return context.BDSQuickAccessTools;
}

function message(text, role = 'assistant', codeText) {
  const body = { innerText: text, textContent: text, parentElement: { closest: () => null } };
  const node = { nodeType: 1, dataset: { messageRole: role }, isConnected: true,
    matches: (selector) => selector === '.ds-message',
    closest: () => node, querySelector: () => null,
    querySelectorAll: (selector) => selector === '.ds-markdown' ? [body] : selector === 'pre code' && code ? [code] : [],
  };
  const wrapper = { dataset: {} };
  const code = codeText === undefined ? null : { textContent: codeText, className: 'language-javascript',
    dataset: { filename: 'Caf\u00e9-\u0623.js' }, isConnected: true, closest: () => wrapper };
  return { node, body, code };
}

const api = tools();
const entry = (id, content, role = 'assistant') => ({ id, content, text: content, role,
  searchable: api.normalizeMessageText(content) });
const marked = (parts) => parts.filter((part) => part.match).map((part) => part.text);

test('search helpers are narrowly scoped and the API is frozen', () => {
  assert.equal(Object.isFrozen(api), true);
  assert.deepEqual(Object.keys(api).sort(), [
    'ConversationIndex', 'downloadText', 'messageExcerpt', 'normalizeMessageText', 'searchMessages', 'serializeMessages',
  ]);
});

test('Arabic search folds harakat, tatweel and alef variants without changing source', () => {
  const original = '\u0623\u064e\u0647\u0652\u0644\u064b\u0627 \u0625\u0644\u0649 \u0622\u0641\u0627\u0642 \u0671\u0644\u0639\u0640\u0640\u0627\u0644\u0645';
  assert.equal(api.normalizeMessageText(original), '\u0627\u0647\u0644\u0627 \u0627\u0644\u0649 \u0627\u0641\u0627\u0642 \u0627\u0644\u0639\u0627\u0644\u0645');
  const result = api.searchMessages([entry('1', original)], '\u0627\u0647\u0644\u0627 \u0627\u0641\u0627\u0642');
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].text, original);
  assert.equal(api.normalizeMessageText('\u0629 \u0647 \u0649 \u064a'), '\u0629 \u0647 \u0649 \u064a');
});

test('Unicode compatibility, Latin accents and canonical combining sequences match', () => {
  assert.equal(api.normalizeMessageText('CAF\u00c9 Cr\u00e8me re\u0301sume\u0301 \ufb03 \uff21\uff22'), 'cafe creme resume ffi ab');
  assert.equal(api.normalizeMessageText('\ufef7\u064e'), '\u0644\u0627');
  assert.equal(api.normalizeMessageText('\u200f\u0623\u0647\u0644\u0627\u061c'), '\u0627\u0647\u0644\u0627');
  // Do not globally erase marks that are meaningful in other writing systems.
  assert.notEqual(api.normalizeMessageText('\u0915\u093f'), api.normalizeMessageText('\u0915'));
  assert.notEqual(api.normalizeMessageText('\u304c'), api.normalizeMessageText('\u304b'));
});

test('messages require every deduplicated query term, in any order, literally', () => {
  const entries = [entry('1', 'Caf\u00e9 first \u0627\u0644\u0639\u064e\u0627\u0644\u064e\u0645'), entry('2', 'caf\u00e9 alone'), entry('3', '[x] literal')];
  const result = api.searchMessages(entries, '  \u0627\u0644\u0639\u0627\u0644\u0645\n CAFE cafe  ');
  assert.deepEqual(plain(result.terms), ['\u0627\u0644\u0639\u0627\u0644\u0645', 'cafe']);
  assert.deepEqual(plain(result.matches.map((item) => item.id)), ['1']);
  assert.equal(api.searchMessages(entries, '[x]').matches.length, 1);
  assert.equal(api.searchMessages(entries, '.*').matches.length, 0);
  assert.equal(api.searchMessages(entries, 'missing cafe').matches.length, 0);
});

test('role counts describe query matches, independent of the selected role', () => {
  const entries = [entry('1', 'hello', 'user'), entry('2', 'HELLO', 'assistant'), entry('3', 'hello', 'message'), entry('4', 'no', 'assistant')];
  const result = api.searchMessages(entries, 'hello', 'assistant');
  assert.deepEqual(plain(result.counts), { all: 3, user: 1, assistant: 1 });
  assert.deepEqual(plain(result.matches.map((item) => item.id)), ['2']);
  assert.equal(api.searchMessages(entries, '', 'user').matches.length, 1);
  assert.equal(api.searchMessages(entries, '  ').matches.length, 4);
  assert.equal(api.searchMessages(entries, '\u064e\u0640').matches.length, 4);
});

test('normalized highlights map to the original alef, diacritics and Latin accents', () => {
  const content = '\u0623\u064e\u0647\u0652\u0644\u064b\u0627 \u0628\u0643\u0645 \u0641\u064a Caf\u00e9 \u0648 re\u0301sume\u0301';
  const result = api.searchMessages([entry('1', content)], 'ahlan');
  assert.equal(result.matches.length, 0); // No transliteration.
  const parts = api.messageExcerpt(content, ['\u0627\u0647\u0644\u0627', 'cafe', 'resume']);
  assert.deepEqual(plain(marked(parts)), ['\u0623\u064e\u0647\u0652\u0644\u064b\u0627', 'Caf\u00e9', 're\u0301sume\u0301']);
  assert.equal(parts.map((part) => part.text).join(''), content);
});

test('highlight offsets handle astral symbols and expanded Unicode ligatures', () => {
  const content = '\ud83d\ude00\ud801\udc00 \ufef7\u064e \ufb03 Caf\u00e9';
  const parts = api.messageExcerpt(content, ['\u0644\u0627', 'ffi', 'cafe']);
  assert.deepEqual(plain(marked(parts)), ['\ufef7\u064e', '\ufb03', 'Caf\u00e9']);
  assert.equal(parts.map((part) => part.text).join(''), content);
  assert.equal(api.messageExcerpt('A\ufb03B', ['f', 'fi']).map((part) => part.text).join(''), 'A\ufb03B');
});

test('highlights merge repeated/overlapping ranges and leave markup as plain text', () => {
  const content = '<img src=x onerror=alert(1)> Caf\u00e9 Caf\u00e9';
  const parts = api.messageExcerpt(content, ['img', 'cafe', 'caf']);
  assert.deepEqual(plain(marked(parts)), ['img', 'Caf\u00e9', 'Caf\u00e9']);
  assert.equal(parts.map((part) => part.text).join(''), content);
  assert.ok(parts.every((part) => typeof part.text === 'string' && typeof part.match === 'boolean'));
  assert.deepEqual(plain(marked(api.messageExcerpt('banana', ['ana']))), ['anana']);
  // Only the fixed dialog template uses innerHTML; excerpts use textContent/append.
  assert.equal((quickAccessSource.match(/\.innerHTML\s*=/g) || []).length, 1);
  assert.ok(quickAccessSource.includes('mark.textContent = part.text'));
  assert.ok(quickAccessSource.includes('excerpt.append(part.text)'));
});

test('excerpts stay bounded and do not split emoji or combining accents at context edges', () => {
  const content = 'x'.repeat(144) + '\ud83d\ude00' + 'x'.repeat(54) + 'Caf\u00e9 ' + 'x'.repeat(98) + 'e\u0301 tail';
  const parts = api.messageExcerpt(content, ['cafe']);
  const excerpt = parts.map((part) => part.text).join('');
  assert.ok(excerpt.startsWith('\u2026\ud83d\ude00'));
  assert.ok(excerpt.endsWith('e\u0301\u2026'));
  assert.ok(excerpt.length < 180);
  assert.equal(excerpt.isWellFormed(), true);
  assert.deepEqual(plain(marked(parts)), ['Caf\u00e9']);
  assert.deepEqual(plain(api.messageExcerpt('', [])), []);
  assert.deepEqual(plain(marked(api.messageExcerpt('plain preview', []))), []);
});

test('index keeps original message/code data and exact legacy file search behavior', () => {
  const source = 'const Caf\u00e9 = "\u0623\u064e\u0647\u0644\u0627";\r\n  Caf\u00e9();\n';
  const original = '\u0623\u064e\u0647\u0652\u0644\u064b\u0627\n\n' + source;
  const fixture = message(original, 'assistant', source);
  const indexed = tools([fixture.node]);
  const [value] = new indexed.ConversationIndex().messages();
  assert.equal(value.text, original.trim());
  assert.equal(value.content, original.trim().replace(/\s+/g, ' '));
  assert.equal(indexed.searchMessages([value], '\u0627\u0647\u0644\u0627 cafe').matches.length, 1);
  const file = value.files[0];
  assert.equal(file.text, source);
  assert.equal(fixture.code.textContent, source);
  assert.equal(file.filename, 'Caf\u00e9-\u0623.js');
  assert.equal(file.size, new TextEncoder().encode(source).length);
  assert.equal(file.searchable, `${file.filename}\njavascript\n${source}`.toLowerCase());
  assert.equal(file.searchable.includes('cafe'), false);
  assert.equal(file.searchable.includes('\u0627\u0647\u0644\u0627'), false);
  assert.equal(file.searchable.includes('caf\u00e9'), true);
  assert.equal(file.searchable.includes('javascript'), true);
  assert.equal(file.searchable.includes('caf\u00e9 javascript'), false);
  assert.ok(quickAccessSource.includes('file.searchable.includes(query)'));
  assert.ok(quickAccessSource.includes('renderFiles(entries, search.value.trim().toLowerCase())'));
});

test('index invalidation refreshes normalized search while retaining stable IDs', () => {
  const fixture = message('old', 'user');
  const indexed = tools([fixture.node]);
  const index = new indexed.ConversationIndex();
  const [before] = index.messages();
  fixture.body.innerText = fixture.body.textContent = '\u0625\u0650\u0646\u0652\u062c\u064e\u0627\u0632 Caf\u00e9';
  assert.equal(index.invalidate([{ target: { nodeType: 3, parentElement: fixture.node }, addedNodes: [], removedNodes: [] }]), true);
  const [after] = index.messages();
  assert.equal(after.id, before.id);
  assert.equal(indexed.searchMessages([after], '\u0627\u0646\u062c\u0627\u0632 cafe').matches.length, 1);
  assert.equal(indexed.searchMessages([after], 'old').matches.length, 0);
});

test('JSON and Markdown exports preserve original text and respect search + role filters', () => {
  const original = '\u0623\u064e\u0647\u0652\u0644\u064b\u0627 Caf\u00e9\n```js\nconst Caf\u00e9 = 1;\n```';
  const entries = [entry('1', original, 'assistant'), entry('2', original, 'user'), entry('3', 'unrelated', 'assistant')];
  const matches = api.searchMessages(entries, 'cafe \u0627\u0647\u0644\u0627', 'assistant').matches;
  const json = JSON.parse(api.serializeMessages(matches, 'json', 'Title', {}));
  assert.deepEqual(json.messages, [{ role: 'assistant', text: original }]);
  const markdown = api.serializeMessages(matches, 'markdown', 'Title', { assistant: 'Assistant' });
  assert.equal(markdown, `# Title\n\n## Assistant\n\n${original}\n`);
  const many = Array.from({ length: 60 }, (_, i) => entry(String(i), original));
  assert.equal(JSON.parse(api.serializeMessages(api.searchMessages(many, 'cafe').matches, 'json', 'Title', {})).messages.length, 60);
});

test('UI wiring keeps independent queries, accessible controls, IME guards and deferred Voice action', () => {
  // Behavior-level rendering/focus is also exercised in the browser fixture.
  for (const expected of ['data-role-filter="all"', 'data-role-filter="user"', 'data-role-filter="assistant"',
    'data-clear-search', 'aria-pressed="true"', 'dir="auto"', 'compositionstart', 'compositionend',
    'if (!dialog.open || composing) return', 'if (!composing && !event.isComposing)',
    'typeof globalThis.BDSVoicePanel?.open === "function"', '() => globalThis.BDSVoicePanel?.open?.()',
    'queries[activeTab] = search.value', 'search.value = queries[name]',
    'searchMessages(index.messages(), query, activeRole).matches']) assert.ok(quickAccessSource.includes(expected), expected);
  const close = quickAccessSource.slice(quickAccessSource.indexOf('dialog.addEventListener("close"'));
  assert.ok(close.indexOf('previousFocus.focus') < close.indexOf('requestAnimationFrame'));
  assert.ok(close.includes('if (!dialog.open) action()'));
});
