/* Real Chromium DOM tests with synthetic reply/media fixtures. No site/account,
 * speech generation or microphone. Start isolated headless Chrome on port 9239.
 * node tests/native-read-aloud-browser.cjs
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CDP } = require('./ui-improvements.cjs');
const root = path.resolve(__dirname, '..');
const controller = fs.readFileSync(path.join(root, 'enhancements/deepseek-voice.js'), 'utf8');
const fixture = fs.readFileSync(path.join(root, 'tests/native-read-aloud-fixture.html'), 'utf8');
const fixtureInline = fixture.slice(fixture.lastIndexOf('<script>') + 8, fixture.lastIndexOf('</script>'));
const init = fixture.slice(fixture.indexOf('<script>') + 8, fixture.indexOf('</script>'));
(async () => {
 const targets = await (await fetch('http://127.0.0.1:9239/json')).json();
 const target = targets.find(t => t.type === 'page'); assert.ok(target, 'isolated browser required');
 const cdp = new CDP(target.webSocketDebuggerUrl); await cdp.connect();
 let passed = 0;
 const e = code => cdp.evaluate(code);
 const tick = () => e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 async function reset() {
   await e('globalThis.BDSDeepSeekVoice?.dispose?.();');
   await cdp.send('Page.navigate', { url: 'about:blank' });
   await e('new Promise(r=>setTimeout(r,20))');
   await cdp.send('Page.setDocumentContent', { frameId: (await cdp.send('Page.getFrameTree')).frameTree.frame.id,
     html: '<!doctype html><html lang="en"><body><main id="messages"></main></body></html>' });
   // Inject the real source in a lexical wrapper with a test-only saved route.
   // This is not a DeepSeek DOM snapshot or a production API surface.
   await e(`${init}\nwindow.__nativeFixtureLocation={href:'https://chat.deepseek.com/a/chat/s/fixture-session'};\n((location)=>{${controller}\n})(window.__nativeFixtureLocation);${fixtureInline}\nBDSDeepSeekVoice.ready`);
 }
 async function check(name, fn) { await reset(); await fn(); passed++; console.log('PASS', name); }
 try {
 await check('historical rows and Live startup never activate audio', async () => {
   await e("fixture.row('history',{stream:false});fixture.start()"); await tick();
   assert.equal((await e('fixture.snapshot()')).clicks, 0);
 });
 await check('Arabic completed reply scoped sibling toolbar activates exactly once, not while streaming', async () => {
   await e("fixture.start();fixture.begin('مرحبا');fixture.row(undefined,{body:'أهلًا! كيف أساعدك؟',media:'observable'})"); await tick();
   assert.equal((await e('fixture.snapshot()')).clicks,0);
   await e('fixture.complete()'); await tick(); assert.equal((await e('fixture.snapshot()')).clicks,0);
   await e('fixture.finishDOM()'); await tick(); let s=await e('fixture.snapshot()');assert.equal(s.clicks,1);assert.equal(s.held,true);assert.equal(s.status.code,'playing');
   await e('fixture.complete();document.querySelector("article").classList.add("rerender")');await tick();assert.equal((await e('fixture.snapshot()')).clicks,1);
   await e('document.querySelector("audio").finish()');assert.equal((await e('fixture.snapshot()')).held,false);
 });
 await check('English subsequent turns do not overlap observable native media', async () => {
   await e("fixture.start();fixture.begin('Hello');fixture.row(undefined,{body:'Hello there',media:'observable'})");await tick();
   await e('fixture.finishDOM();fixture.complete()');await tick();assert.equal((await e('fixture.snapshot()')).clicks,1);
   await e('document.querySelector("audio").finish();fixture.begin("Next");fixture.row(undefined,{media:"observable"})');await tick();
   await e('fixture.finishDOM();fixture.complete()');await tick();let s=await e('fixture.snapshot()');assert.equal(s.clicks,2);assert.equal(s.held,true);
 });
 await check('virtualized row is rebound by opaque key despite changed random BDS id', async () => {
   await e('fixture.start();fixture.begin();fixture.row()');await tick();
   await e('document.querySelector("article").remove();fixture.complete()');await tick();assert.equal((await e('fixture.snapshot()')).clicks,0);
   await e('fixture.row(undefined,{stream:false})');await tick();assert.equal((await e('fixture.snapshot()')).clicks,1);
 });
 await check('a new chat without a session URL adopts the request session and follows it', async () => {
   await e('fixture.setHref("https://chat.deepseek.com/");fixture.start();fixture.begin("أول رسالة")');await tick();
   await e('fixture.row(undefined,{body:"مرحبًا"})');await tick();
   await e('fixture.setHref("https://chat.deepseek.com/a/chat/s/fixture-session");window.dispatchEvent(new CustomEvent("bds:urlChanged"));fixture.finishDOM();fixture.complete()');await tick();
   let s=await e('fixture.snapshot()');assert.equal(s.clicks,1);assert.equal(s.held,true);
 });
 await check('missing native control can appear late after verified completion', async () => {
   await e('fixture.start();fixture.begin();fixture.row(undefined,{button:false})');await tick();
   await e('fixture.finishDOM();fixture.complete()');await tick();assert.equal((await e('fixture.snapshot()')).clicks,0);
   await e('fixture.addButton(document.querySelector("article"))');await tick();assert.equal((await e('fixture.snapshot()')).clicks,1);
 });
 await check('a stable native toolbar completes when the protocol bridge sends no terminal', async () => {
   await e('fixture.start();fixture.begin("fallback");fixture.row(undefined,{stream:true,media:"observable"})');await tick();
   await e('fixture.finishDOM()');
   await e('new Promise(r=>setTimeout(r,750))');await tick();
   const value=await e('fixture.snapshot()');assert.equal(value.clicks,1);assert.equal(value.held,true);
 });
 await check('disabled control never clicked and mutation observer does not loop', async () => {
   await e('fixture.start();fixture.begin();fixture.row(undefined,{disabled:true})');await tick();
   await e('fixture.finishDOM();fixture.complete()');await tick();assert.equal((await e('fixture.snapshot()')).clicks,0);
   assert.equal((await e('fixture.snapshot()')).status.code,'disabled');
   await e('document.querySelector("[role=toolbar] [role=button]").setAttribute("aria-disabled","false")');await tick();assert.equal((await e('fixture.snapshot()')).clicks,1);
 });
 await check('ambiguous keyed streaming rows and unverified identity fail closed', async () => {
   await e('fixture.start();fixture.begin();fixture.row("a");fixture.row("b")');await tick();
   await e('fixture.finishDOM("a");fixture.finishDOM("b");fixture.complete()');await tick();let s=await e('fixture.snapshot()');assert.equal(s.clicks,0);assert.ok(['ambiguous','identity-unverified'].includes(s.status.code));
 });
 await check('native media end is not inferred from text, DOM removal, or button reappearance', async () => {
   await e('fixture.start();fixture.begin();fixture.row()');await tick();await e('fixture.finishDOM();fixture.complete()');await tick();
   await e('document.querySelector("article").remove()');await tick();let s=await e('fixture.snapshot()');assert.equal(s.held,true);
   await e('fixture.api().cancel()');assert.equal((await e('fixture.snapshot()')).held,true);
   await e('fixture.api().confirmStopped()');assert.equal((await e('fixture.snapshot()')).held,false);
 });
 await check('stop uses observed media pause and never clicks Read aloud again', async () => {
   await e('fixture.start();fixture.begin();fixture.row(undefined,{media:"observable"})');await tick();await e('fixture.finishDOM();fixture.complete()');await tick();
   await e('fixture.api().cancel()');let s=await e('fixture.snapshot()');assert.equal(s.clicks,1);assert.equal(s.held,false);assert.equal(s.status.code,'ended');
 });
 await check('navigation cancels pending activation and no observers reactivate it', async () => {
   await e('fixture.start();fixture.begin();fixture.row()');await tick();await e('fixture.setHref("https://chat.deepseek.com/a/chat/s/other");window.dispatchEvent(new CustomEvent("bds:urlChanged"));fixture.finishDOM();fixture.complete()');await tick();assert.equal((await e('fixture.snapshot()')).clicks,0);
 });
 await check('Live stop cancels delayed controls and completion events', async () => {
   await e('fixture.start();fixture.begin();fixture.row(undefined,{button:false})');await tick();await e('fixture.finishDOM();fixture.complete();fixture.stop();fixture.addButton(document.querySelector("article"))');await tick();assert.equal((await e('fixture.snapshot()')).clicks,0);
 });
 await check('regeneration is a new request version for the same turn and opaque row', async () => {
   await e('fixture.start();fixture.begin();fixture.row(undefined,{media:"observable"})');await tick();await e('fixture.finishDOM();fixture.complete("server-v1")');await tick();await e('document.querySelector("audio").finish();fixture.dispatch({phase:"start",requestId:"regen",version:"regen",kind:"edit_message",requestMessageId:"server-v1"});const c=document.createElement("span");c.className="ds-cursor";document.querySelector(".ds-message").append(c)');await tick();
   await e('fixture.finishDOM();fixture.dispatch({phase:"completed",requestId:"regen",version:"regen",messageId:"server-v2"})');await tick();assert.equal((await e('fixture.snapshot()')).clicks,2);
 });
 await check('observed native Web Audio end lets Live exit Speaking and resume listening', async () => {
   await e('fixture.start();fixture.begin("صوت");fixture.row(undefined,{body:"رد صوتي"})');await tick();
   await e('fixture.finishDOM();fixture.complete()');await tick();
   let s=await e('fixture.snapshot()');assert.equal(s.clicks,1);assert.equal(s.held,true);assert.equal(s.status.code,'requested');
   await e('fixture.playbackEvent("start")');s=await e('fixture.snapshot()');assert.equal(s.status.code,'playing');assert.equal(s.held,true);
   await e('fixture.playbackEvent("end")');s=await e('fixture.snapshot()');assert.equal(s.held,false);assert.equal(s.releases,1);assert.equal(s.status.code,'ended');
   await e('fixture.playbackEvent("end")');s=await e('fixture.snapshot()');assert.equal(s.releases,1,'duplicate end must not release twice');
 });
 await check('native unsupported-language toast releases the mic and is not retried for Arabic', async () => {
   await e('fixture.start();fixture.begin("مرحبا");fixture.row(undefined,{body:"أهلاً وسهلاً، كيف أساعدك اليوم؟"})');await tick();
   await e('fixture.finishDOM();fixture.complete()');await tick();
   let s=await e('fixture.snapshot()');assert.equal(s.clicks,1);assert.equal(s.held,true);
   await e('fixture.siteToast("Read aloud isn\'t supported for this language yet.")');await tick();
   s=await e('fixture.snapshot()');assert.equal(s.status.code,'language-unsupported');assert.equal(s.held,false);assert.equal(s.releases,1);assert.equal(s.clicks,1);
   await e('fixture.begin("سؤال آخر");fixture.row(undefined,{body:"رد عربي آخر بسيط"})');await tick();
   await e('fixture.finishDOM();fixture.complete()');await tick();
   s=await e('fixture.snapshot()');assert.equal(s.clicks,1,'unsupported Arabic must not be retried');assert.equal(s.held,false);assert.equal(s.status.code,'language-unsupported');
 });
 await check('unknown playback requires user confirmation, Play reply does not synthetic retry', async () => {
   await e('fixture.start();fixture.begin();fixture.row()');await tick();await e('fixture.finishDOM();fixture.complete()');await tick();
   await e('fixture.api().revealReply()');let s=await e('fixture.snapshot()');assert.equal(s.clicks,1);assert.equal(s.held,true);assert.equal(s.status.code,'needs-confirmation');
   await e('fixture.api().confirmStopped()');assert.equal((await e('fixture.snapshot()')).held,false);
 });
 await check('setting off preserves microphone functions but prevents new automatic native clicks', async () => {
   await e('fixture.start();fixture.api().setAutoRead(false)');await e('fixture.begin();fixture.row()');await tick();await e('fixture.finishDOM();fixture.complete()');await tick();assert.equal((await e('fixture.snapshot()')).clicks,0);
 });
 await check('page teardown disposes controller and removes its UI', async () => {
   await e('fixture.start();fixture.begin();fixture.row()');await tick();await e('window.dispatchEvent(new Event("pagehide"));fixture.finishDOM();fixture.complete()');await tick();assert.equal((await e('fixture.snapshot()')).clicks,0);assert.equal(await e('document.querySelector(".bds-native-live-audio")'),null);
 });
 console.log(JSON.stringify({passed,kind:'isolated-real-Chromium-DOM',actualDeepSeekRuntime:false,audioHeard:false}));
 } finally { await e('globalThis.BDSDeepSeekVoice?.dispose?.()'); await cdp.send('Browser.close'); cdp.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
