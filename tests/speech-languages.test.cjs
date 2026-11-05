/* Run with: node --test --test-isolation=none tests/speech-languages.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../enhancements/speech-languages.js'), 'utf8');

function load(intl = Intl) {
  const context = vm.createContext({ Intl: intl });
  vm.runInContext(source, context, { filename: 'speech-languages.js' });
  return context.BDSSpeechLanguages;
}
const api = load();
const installed = [
  { id: 'ar-voice', language: 'ar-JO', name: 'Arabic', sampleRate: 22050 },
  { id: 'en-gb', language: 'en-GB', name: 'British English', sampleRate: 22050 },
  { id: 'en-us', language: 'en-US', name: 'American English', sampleRate: 24000 },
  { id: 'zh-hant', language: 'zh-Hant', name: 'Traditional Chinese', sampleRate: 22050 },
  { id: 'zh-hans', language: 'zh-Hans', name: 'Simplified Chinese', sampleRate: 22050 },
];

function browser(lang, voiceURI, extra = {}) {
  return { lang, voiceURI, name: voiceURI, default: false, localService: false, ...extra };
}

test('pure IIFE exports a frozen API without browser globals or side effects', () => {
  const context = vm.createContext({ Intl });
  for (const property of ['window', 'document', 'navigator', 'fetch', 'XMLHttpRequest', 'chrome']) {
    Object.defineProperty(context, property, { get() { throw new Error(`Unexpected access: ${property}`); } });
  }
  vm.runInContext(source, context);
  const result = context.BDSSpeechLanguages;
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(Object.keys(result).sort(), [
    'canonicalize', 'label', 'listOptions', 'matchLanguage', 'primary', 'sample', 'selectBrowserVoice', 'selectVoice',
  ]);
  assert.equal(result.canonicalize('EN-us'), 'en-US');
  assert.equal(result.selectBrowserVoice([], 'en-US'), null);
  assert.equal(result.sample('qaa-ZZ'), null);
});

test('canonicalize uses Intl for canonical case and deprecated language/region aliases', () => {
  for (const [value, expected] of [
    ['EN-us', 'en-US'], ['zh-hant-tw', 'zh-Hant-TW'], ['sr-latn-RS', 'sr-Latn-RS'],
    ['iw-IL', 'he-IL'], ['in-ID', 'id-ID'], ['ji', 'yi'], ['sh', 'sr-Latn'],
    ['en-UK', 'en-GB'], ['en-BU', 'en-MM'], ['cmn-CN', 'zh-CN'],
  ]) assert.equal(api.canonicalize(value), expected);
  assert.equal(api.primary('IW-il'), 'he');
  assert.equal(api.primary('SH-RS'), 'sr');
  assert.equal(api.primary('zh-Hant-TW'), 'zh');
});

test('explicit script conflicts do not select a different alphabet voice', () => {
  assert.equal(api.matchLanguage('sr-Latn-RS','sr-Cyrl-RS'),false);
  assert.equal(api.selectVoice([{id:'cyrillic',language:'sr-Cyrl'}],'sr-Latn'),null);
  assert.equal(api.matchLanguage('sr-RS','sr-Cyrl-RS'),true);
});

test('valid custom locales are accepted without catalog membership', () => {
  for (const value of ['qaa-ZZ', 'ast-ES', 'kok-IN', 'en-US-u-nu-latn', 'de-CH-1901', 'en-x-custom']) {
    assert.equal(api.canonicalize(value, null), Intl.getCanonicalLocales(value)[0]);
  }
  assert.equal(api.primary('qaa-ZZ'), 'qaa');
  assert.equal(api.matchLanguage('qaa-AA', 'qaa-ZZ'), true);
  assert.equal(api.selectVoice([{ id: 'custom', language: 'qaa-ZZ' }], 'qaa-AA').id, 'custom');
});

test('invalid, non-ASCII, overlong and non-string tags return a validated fallback', () => {
  const invalid = [
    undefined, null, false, 12, {}, [], new String('en-US'), '', ' en-US', 'en-US ', '\ten-US',
    'en_US', 'en--US', '-en', 'en-', 'en-US\n', 'ｅｎ-US', 'en-عربي', 'en-\u0000US',
    'en-@US', 'x-private', 'i-klingon', 'en-Latn-Cyrl', 'en-variant-variant', 'en-a-foo-a-bar',
    'en-' + 'x'.repeat(58),
  ];
  for (const value of invalid) {
    assert.equal(api.canonicalize(value), 'en-US', String(value));
    assert.equal(api.canonicalize(value, 'AR-eg'), 'ar-EG', String(value));
    assert.equal(api.canonicalize(value, null), null, String(value));
  }
  assert.equal(api.canonicalize('wrong_tag', 'also_wrong'), 'en-US');
  assert.equal(api.canonicalize('ar-SA', 'wrong_tag'), 'ar-SA');
  assert.equal(api.primary('wrong_tag'), '');
  // Exactly 60 ASCII characters are permitted; 61 must fail before Intl.
  const atLimit = 'en-x-' + Array(6).fill('abcdefgh').join('-') + '-a';
  assert.equal(atLimit.length, 60);
  assert.equal(api.canonicalize(atLimit, null), atLimit);
  assert.equal(api.canonicalize(atLimit + 'b', null), null);
});

test('Intl is actually used and invalid values are rejected before reaching it', () => {
  const calls = [];
  const instrumented = load({ getCanonicalLocales(value) { calls.push(value); return Intl.getCanonicalLocales(value); } });
  assert.equal(instrumented.canonicalize('iw-IL'), 'he-IL');
  assert.deepEqual(calls, ['iw-IL']);
  assert.equal(instrumented.canonicalize('en_US', null), null);
  assert.equal(instrumented.canonicalize('é', null), null);
  assert.equal(instrumented.canonicalize('a'.repeat(61), null), null);
  assert.deepEqual(calls, ['iw-IL']);
});

test('conservative canonicalization still works when Intl is missing or partial', () => {
  for (const intl of [undefined, {}, { DisplayNames: Intl.DisplayNames }]) {
    const fallback = load(intl === undefined ? null : intl);
    for (const [value, expected] of [
      ['EN-us', 'en-US'], ['zh-hant-tw', 'zh-Hant-TW'], ['iw-IL', 'he-IL'],
      ['in-ID', 'id-ID'], ['sh-RS', 'sr-Latn-RS'], ['en-UK', 'en-GB'],
      ['de-CH-1901', 'de-CH-1901'], ['qaa-ZZ', 'qaa-ZZ'], ['en-x-custom', 'en-x-custom'],
      ['en-u-nu-latn-a-foo', 'en-a-foo-u-nu-latn'],
    ]) assert.equal(fallback.canonicalize(value, null), expected);
    for (const value of ['abcd', 'en-', 'en_US', 'en-abc', 'en-a', 'en-x', 'en-1901-1901', 'en-a-foo-a-bar', 'x-private', 'en-US\n', 'en-US\u2028', 'ｅｎ-US', 'a'.repeat(61)]) {
      assert.equal(fallback.canonicalize(value, null), null, value);
    }
    assert.equal(fallback.matchLanguage('iw-IL', 'he-US'), true);
    assert.equal(fallback.primary('SH-RS'), 'sr');
  }
});

test('language matching accepts exact/primary relatives but never unrelated or invalid tags', () => {
  for (const [requested, offered] of [
    ['en-US', 'EN-us'], ['en-GB', 'en-US'], ['ar-SA', 'ar-JO'], ['iw-IL', 'he-IL'],
    ['pt-PT', 'pt-BR'], ['ast-ES', 'ast'], ['en-US-u-nu-latn', 'en-US'],
  ]) assert.equal(api.matchLanguage(requested, offered), true);
  for (const [requested, offered] of [
    ['en-US', 'ar-SA'], ['ar-SA', 'en-SA'], ['ja-JP', 'ko-KR'], ['en-US', 'en_US'],
    ['bad_tag', 'en-US'], ['', ''], [null, 'en-US'], ['no-NO', 'nb-NO'],
  ]) assert.equal(api.matchLanguage(requested, offered), false);
});

test('Chinese script distinctions include region-implied scripts and explicit overrides', () => {
  for (const [requested, offered] of [
    ['zh-CN', 'zh-Hans'], ['zh-SG', 'zh-Hans-CN'], ['zh-TW', 'zh-Hant'],
    ['zh-HK', 'zh-Hant-TW'], ['zh-Hant-CN', 'zh-TW'], ['zh-Hans-TW', 'zh-CN'],
    ['zh', 'zh-Hant'], ['zh-Hans', 'zh'],
  ]) assert.equal(api.matchLanguage(requested, offered), true, `${requested} / ${offered}`);
  for (const [requested, offered] of [
    ['zh-Hans', 'zh-Hant'], ['zh-CN', 'zh-TW'], ['zh-Hans-CN', 'zh-Hant-CN'],
    ['zh-TW', 'zh-Hans'], ['zh-MO', 'zh-SG'], ['zh-Hans-TW', 'zh-Hant'],
    ['zh-Latn', 'zh-CN'], ['zh-CN', 'yue-HK'],
  ]) assert.equal(api.matchLanguage(requested, offered), false, `${requested} / ${offered}`);
  assert.equal(api.selectVoice(installed, 'zh-CN').id, 'zh-hans');
  assert.equal(api.selectVoice(installed, 'zh-TW').id, 'zh-hant');
  assert.equal(api.selectVoice([installed[3]], 'zh-CN'), null);
});

test('installed voices prefer exact canonical locale, then region, then same primary', () => {
  assert.equal(api.selectVoice(installed, 'EN-us'), installed[2]);
  assert.equal(api.selectVoice(installed, 'en-AU'), installed[1]);
  assert.equal(api.selectVoice(installed, 'ar-EG'), installed[0]);
  assert.equal(api.selectVoice(installed, 'ja-JP'), null);
  assert.equal(api.selectVoice(installed, 'en_US'), null);
  const extended = [installed[1], { id: 'us-extension', language: 'en-US-u-nu-latn' }];
  assert.equal(api.selectVoice(extended, 'en-US'), extended[1]);
  const aliases = [{ id: 'hebrew', language: 'iw-IL' }];
  assert.equal(api.selectVoice(aliases, 'he-IL'), aliases[0]);
});

test('an explicit installed voice is never silently replaced when missing or wrong-language', () => {
  assert.equal(api.selectVoice(installed, 'en-US', 'en-gb'), installed[1]);
  assert.equal(api.selectVoice(installed, 'en-US', 'ar-voice'), null);
  assert.equal(api.selectVoice(installed, 'en-US', 'missing'), null);
  assert.equal(api.selectVoice(installed, 'zh-CN', 'zh-hant'), null);
  assert.equal(api.selectVoice(installed, 'en-US', null), null);
  assert.equal(api.selectVoice(installed, 'en-US', 123), null);
  assert.equal(api.selectVoice([], 'en-US', 'en-us'), null);
});

test('malformed installed voice entries are ignored without mutating input', () => {
  const good = Object.freeze({ id: 'good', language: 'en-GB', name: 'Good', sampleRate: 22050 });
  const voices = Object.freeze([null, 1, {}, { id: '', language: 'en-US' }, { id: 'broken', language: 'en_US' }, good]);
  assert.equal(api.selectVoice(voices, 'en-US'), good);
  assert.equal(api.selectVoice(undefined, 'en-US'), null);
  assert.equal(api.selectVoice({}, 'en-US'), null);
  assert.equal(voices.at(-1), good);
});

test('browser voices prefer exact locale over default/local voices of another region', () => {
  const gb = browser('en-GB', 'gb', { default: true, localService: true });
  const us = browser('en-US', 'us');
  const ar = browser('ar-SA', 'ar', { default: true });
  const voices = Object.freeze([gb, ar, us]);
  assert.equal(api.selectBrowserVoice(voices, 'EN-us'), us);
  assert.equal(api.selectBrowserVoice(voices, 'ar-EG'), ar);
  assert.equal(api.selectBrowserVoice(voices, 'ja-JP'), null);
  assert.deepEqual(voices, [gb, ar, us]);
});

test('browser default/local preference and lexical tie-breaks are deterministic within a locale', () => {
  const remote = browser('en-US', 'remote');
  const localZ = browser('en-US', 'z-local', { localService: true });
  const localA = browser('en-US', 'a-local', { localService: true });
  const preferredDefault = browser('en-US', 'default-remote', { default: true });
  const defaultLocal = browser('en-US', 'default-local', { default: true, localService: true });
  assert.equal(api.selectBrowserVoice([localZ, remote, localA], 'en-US'), localA);
  assert.equal(api.selectBrowserVoice([localA, remote, localZ], 'en-US'), localA);
  assert.equal(api.selectBrowserVoice([localA, preferredDefault], 'en-US'), preferredDefault);
  assert.equal(api.selectBrowserVoice([preferredDefault, defaultLocal], 'en-US'), defaultLocal);
  const alternatives = [browser('en-GB', 'b'), browser('en-CA', 'a')];
  assert.equal(api.selectBrowserVoice(alternatives, 'en-AU').voiceURI, 'a');
  assert.equal(api.selectBrowserVoice([...alternatives].reverse(), 'en-AU').voiceURI, 'a');
});

test('browser explicit voice URI must be present and language-compatible', () => {
  const us = browser('en-US', 'us'), gb = browser('en-GB', 'gb'), ar = browser('ar-SA', 'ar');
  assert.equal(api.selectBrowserVoice([us, gb, ar], 'en-US', 'gb'), gb);
  assert.equal(api.selectBrowserVoice([us, gb, ar], 'en-US', 'ar'), null);
  assert.equal(api.selectBrowserVoice([us, gb, ar], 'en-US', 'missing'), null);
  assert.equal(api.selectBrowserVoice([us], 'en-US', false), null);
  const hans = browser('zh-Hans', 'hans'), hant = browser('zh-Hant', 'hant');
  assert.equal(api.selectBrowserVoice([hant, hans], 'zh-CN'), hans);
  assert.equal(api.selectBrowserVoice([hans], 'zh-TW'), null);
  assert.equal(api.selectBrowserVoice([hans, hant], 'zh-CN', 'hant'), null);
});

test('no compatible browser voice returns null instead of an unrelated automatic voice', () => {
  for (const voices of [undefined, null, {}, [], [null, {}, browser('ar-SA', 'ar')], [browser('en_US', 'invalid')]]) {
    assert.equal(api.selectBrowserVoice(voices, 'en-US'), null);
  }
  assert.equal(api.selectBrowserVoice([browser('en-US', 'en')], 'invalid_tag'), null);
});

test('options provide unique canonical common locales, translated labels and native fallback', () => {
  const options = api.listOptions('en');
  assert.ok(options.length >= 60 && options.length <= 75);
  const values = Array.from(options, (option) => option.value);
  assert.equal(new Set(values).size, values.length);
  for (const value of ['ar-SA', 'ar-EG', 'ar-JO', 'en-US', 'en-GB', 'en-IN', 'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR', 'hi-IN', 'ta-IN']) {
    assert.ok(values.includes(value), value);
  }
  const englishNames = new Intl.DisplayNames(['en'], { type: 'language' });
  const arabicNames = new Intl.DisplayNames(['ar'], { type: 'language' });
  for (const option of options) {
    assert.equal(option.value, api.canonicalize(option.value, null));
    assert.equal(option.label, englishNames.of(option.value));
  }
  assert.equal(api.listOptions('ar').find((option) => option.value === 'en-US').label, arabicNames.of('en-US'));
  for (const withoutDisplayNames of [load(null), load({ getCanonicalLocales: Intl.getCanonicalLocales })]) {
    assert.equal(withoutDisplayNames.label('ar-EG'), 'العربية (مصر)');
    assert.equal(withoutDisplayNames.label('zh-TW'), '中文（台灣）');
    assert.equal(withoutDisplayNames.label('qaa-ZZ'), 'qaa-ZZ');
  }
  const first = api.listOptions('en'); first[0].value = 'mutated'; first.push({ value: 'bad' });
  assert.equal(api.listOptions('en').length, options.length);
  assert.equal(api.listOptions('en')[0].value, 'ar-SA');
});

test('label accepts custom locales and degrades safely with missing Intl display data', () => {
  const broken = load({ getCanonicalLocales: Intl.getCanonicalLocales, DisplayNames: class { constructor() { throw new Error('missing locale data'); } } });
  assert.equal(broken.label('ja-JP', 'en'), '日本語（日本）');
  assert.equal(broken.label('ast-ES', 'en'), 'ast-ES');
  assert.equal(api.label('bad_tag'), '');
  assert.equal(api.label('ja-JP', 'bad_tag'), new Intl.DisplayNames(['en'], { type: 'language' }).of('ja-JP'));
  assert.equal(api.label('qaa-ZZ'), new Intl.DisplayNames(['en'], { type: 'language' }).of('qaa-ZZ'));
  // Intl.DisplayNames may reject valid Unicode/private-use extensions; the
  // canonical tag remains a safe, meaningful label instead of throwing.
  assert.equal(api.label('en-US-u-nu-latn'), 'en-US-u-nu-latn');
  assert.equal(api.label('en-x-custom'), 'en-x-custom');
});

test('samples use authored natural language text and never default unknown languages to English', () => {
  const english = api.sample('en-US');
  assert.match(english, /Hello/);
  assert.equal(api.sample('en-AU'), english);
  assert.match(api.sample('ar-SA'), /مرحباً/);
  assert.equal(api.sample('ar-EG'), api.sample('ar-JO'));
  assert.match(api.sample('ja-JP'), /こんにちは/);
  assert.match(api.sample('ko-KR'), /안녕하세요/);
  assert.match(api.sample('hi-IN'), /नमस्ते/);
  for (const value of ['ar-EG', 'es-MX', 'fr-CA', 'de-DE', 'pt-BR', 'ru-RU', 'uk-UA', 'ja-JP', 'ko-KR', 'hi-IN', 'ur-PK', 'fa-IR', 'bn-BD', 'ta-IN', 'te-IN', 'id-ID', 'th-TH', 'vi-VN', 'tr-TR', 'he-IL', 'nl-NL', 'it-IT', 'sv-SE', 'pl-PL', 'cs-CZ']) {
    assert.equal(typeof api.sample(value), 'string', value);
    assert.notEqual(api.sample(value), english, value);
  }
  assert.equal(api.sample('iw-IL'), api.sample('he-IL'));
  for (const value of ['qaa-ZZ', 'ast-ES', 'bad_tag', '', null, undefined, 'ar-Latn', 'en-Cyrl', 'zh-Latn', 'pa-Arab-PK']) {
    assert.equal(api.sample(value), null, String(value));
  }
});

test('Chinese sample text respects both explicit script and region', () => {
  const simplified = api.sample('zh-CN'), traditional = api.sample('zh-TW');
  assert.notEqual(simplified, traditional);
  assert.match(simplified, /这是/);
  assert.match(traditional, /這是/);
  assert.equal(api.sample('zh-Hans'), simplified);
  assert.equal(api.sample('zh-SG'), simplified);
  assert.equal(api.sample('zh-Hant'), traditional);
  assert.equal(api.sample('zh-HK'), traditional);
  assert.equal(api.sample('zh-Hans-TW'), simplified);
  assert.equal(api.sample('zh-Hant-CN'), traditional);
  assert.equal(api.sample('yue-HK'), null);
});
