/* node --test --test-isolation=none tests/voice-panel.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('the local speech service is gone from the package', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const scripts = manifest.content_scripts[0].js;
  const styles = manifest.content_scripts[0].css;
  assert.ok(scripts.includes('enhancements/voice-panel.js'));
  assert.ok(styles.includes('enhancements/voice-panel.css'));
  assert.equal(fs.existsSync(path.join(root, 'local-tts')), false);
  for (const file of ['enhancements/local-tts.js', 'enhancements/local-tts.css',
    'enhancements/local-tts-background.js', 'tests/local-tts.test.cjs', 'tests/test_local_tts.py']) {
    assert.equal(fs.existsSync(path.join(root, file)), false, file);
  }
  assert.equal(manifest.background.service_worker, 'enhancements/service-worker.js');
  assert.equal(read('enhancements/service-worker.js').trim().split('\n').pop(),
    'importScripts("../background.js", "speech-languages.js");');
});

test('no shipped script still opens the loopback speech service or calls its API', () => {
  for (const file of ['content.js', 'injected.js', 'enhancements/live-audio.js', 'enhancements/voice-panel.js',
    'enhancements/deepseek-voice.js', 'enhancements/quick-access.js', 'enhancements/conversation-tools.js',
    'enhancements/service-worker.js']) {
    const source = read(file);
    assert.equal(source.includes('BDSLocalTTS'), false, `${file} references BDSLocalTTS`);
    assert.equal(source.includes('127.0.0.1:17863'), false, `${file} references the local speech port`);
    assert.equal(source.includes('BDS_LOCAL_TTS'), false, `${file} references the background transport`);
  }
});

test('DeepSeek native voice is the only speech path', () => {
  const live = read('enhancements/live-audio.js');
  const panel = read('enhancements/voice-panel.js');
  const bundle = read('content.js');
  // The bundle's own auto-reader (which could fall back to a browser voice) is inert.
  assert.ok(bundle.includes('function Pyt(e){}'));
  assert.equal(bundle.includes('speechSynthesis'), false);
  assert.equal(bundle.includes('SpeechSynthesisUtterance'), false);
  // Live never synthesizes: it only pauses the microphone around native audio.
  assert.equal(live.includes('SpeechSynthesisUtterance'), false);
  assert.equal(live.includes('speechSynthesis.speak'), false);
  assert.ok(live.includes('proto.queueTTS = function () {};'));
  assert.ok(live.includes('BDSDeepSeekVoice'));
  assert.ok(live.includes('_pauseForNativeSpeech'));
  assert.ok(live.includes('_resumeAfterNativeSpeech'));
  // Live completion is owned by the per-turn native UI controller, not a text timer.
  assert.ok(live.includes('proto.startResponseWatcher = function () {};'));
  // The panel exposes the single auto-read switch and no browser-voice picker.
  assert.ok(panel.includes('data-auto-read-toggle'));
  assert.equal(panel.includes('data-native-toggle'), false);
  assert.equal(panel.includes('data-voice"'), false);
  assert.ok(panel.includes('BDSDeepSeekVoice'));
});

test('the voice entry points use the new panel', () => {
  assert.ok(read('enhancements/quick-access.js').includes('globalThis.BDSVoicePanel?.open'));
  const panel = read('enhancements/voice-panel.js');
  assert.ok(panel.includes('data-language'));
  assert.ok(panel.includes('data-inspect-native'));
  assert.ok(panel.includes('voice.inspect()'));
  assert.ok(panel.includes('voice?.status'));
  assert.ok(panel.includes('current Live reply'));
  assert.equal(panel.includes('data-test-native'), false);
  assert.equal(panel.includes('voice.probe('), false);
  assert.equal(panel.includes('deepseekProbe'), false);
  assert.equal(panel.includes('deepseekVoice()?.cancel'), false);
  // The helper only uses the site's controls; no private speech transport remains.
  const controller = read('enhancements/deepseek-voice.js');
  assert.ok(controller.includes('liveNativeAutoRead'));
  assert.equal(controller.includes('/auth/ticket'), false);
  assert.equal(controller.includes('new WebSocket'), false);
  assert.equal(controller.includes('new AudioContext'), false);
});
