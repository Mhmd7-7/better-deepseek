/* Real Chromium checks on the isolated fixture; no user tabs, microphone or cloud. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const SCREENSHOTS = path.join(ROOT, 'docs', 'screenshots');

class CDP {
  constructor(url) { this.socket = new WebSocket(url); this.next = 0; this.pending = new Map(); }
  async connect() {
    await new Promise((resolve, reject) => { this.socket.addEventListener('open', resolve, {once:true}); this.socket.addEventListener('error', reject, {once:true}); });
    this.socket.addEventListener('message', (event) => {
      const data = JSON.parse(event.data); if (!data.id) return;
      const pending = this.pending.get(data.id); if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(data.id);
      if (data.error) pending.reject(new Error(JSON.stringify(data.error))); else pending.resolve(data.result);
    });
  }
  send(method, params = {}) {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
      this.pending.set(id,{resolve,reject,timer}); this.socket.send(JSON.stringify({id,method,params}));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + JSON.stringify(result.exceptionDetails.exception));
    return result.result?.value;
  }
  async shot(name) {
    if (process.env.BDS_SKIP_SCREENSHOTS) return;
    const result = await this.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    fs.mkdirSync(SCREENSHOTS,{recursive:true}); fs.writeFileSync(path.join(SCREENSHOTS,name),Buffer.from(result.data,'base64'));
  }
  async click(selector) {
    await this.evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if(!node) throw new Error('Missing '+${JSON.stringify(selector)}); node.click(); })()`);
  }
  async waitFor(expression, description) {
    const value = await this.evaluate(`new Promise((resolve,reject) => {
      let timer; const check=()=>{try{if(${expression}){clearInterval(timer);resolve(true);}}catch(error){clearInterval(timer);reject(error);}};
      timer=setInterval(check,25);check();setTimeout(()=>{clearInterval(timer);reject(new Error(${JSON.stringify(description)}));},5000);
    })`); assert.equal(value,true);
  }
  close() { this.socket.close(); }
}

if (require.main !== module) module.exports = { CDP };
else (async () => {
  const targets = await (await fetch('http://127.0.0.1:9228/json')).json();
  const target = targets.find((tab) => tab.url.includes('improvements-fixture.html'));
  assert.ok(target,'Isolated Chromium fixture must be open');
  const cdp = new CDP(target.webSocketDebuggerUrl); await cdp.connect();
  const errors = [];
  cdp.socket.addEventListener('message',(event)=>{const data=JSON.parse(event.data);if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails.text);});
  try {
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:1040,deviceScaleFactor:1,mobile:false});
    await cdp.send('Page.reload',{ignoreCache:true});
    await cdp.waitFor(`document.querySelector('.bds-qa-launcher') && globalThis.BDSVoicePanel && globalThis.BDSDeepSeekVoice`, 'UI did not mount');
    await cdp.click('.bds-qa-launcher');
    await cdp.waitFor(`document.querySelector('#bds-qa-dialog').open`, 'Quick access did not open');
    await cdp.evaluate(`(() => {const search=document.querySelector('.bds-qa-search');search.value='ادارة المشروعات';search.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await cdp.waitFor(`document.querySelectorAll('.bds-qa-result').length===2`, 'Arabic normalized search did not match both messages');
    await cdp.shot('improvement-1-arabic-search.png');
    await cdp.click('[data-role-filter="assistant"]');
    await cdp.waitFor(`document.querySelectorAll('.bds-qa-result').length===1`, 'Assistant role filter failed');
    assert.ok(await cdp.evaluate(`document.querySelector('.bds-qa-excerpt mark')?.textContent.length > 0`));
    await cdp.shot('improvement-2-assistant-filter.png');
    await cdp.click('[data-clear-search]');
    await cdp.click('[data-role-filter="all"]');
    await cdp.evaluate(`(() => { const action = [...document.querySelectorAll('.bds-qa-actions button')].find(node => node.textContent.includes('إعدادات الصوت')); if(!action) throw new Error('Voice settings action missing'); action.click(); })()`);
    await cdp.waitFor(`document.querySelector('#bds-voice-panel dialog').open`, 'Voice panel did not open from quick access');
    assert.equal(await cdp.evaluate(`document.querySelector('#bds-qa-dialog').open`),false);
    assert.equal(await cdp.evaluate(`document.querySelector('#bds-voice-panel dialog').contains(document.activeElement)`),true);
    await cdp.shot('improvement-3-voice-panel.png');
    // Read-aloud controls: reflect storage, persist toggles, fail loudly outside a chat.
    assert.equal(await cdp.evaluate(`document.querySelector('[data-auto-read-toggle]').checked`),true);
    assert.ok((await cdp.evaluate(`document.querySelector('[data-native-support]').textContent`)).length > 0);
    assert.equal(await cdp.evaluate(`document.querySelector('[data-native-support]').dataset.state`),'ready');
    await cdp.click('[data-auto-read-toggle]');
    await cdp.waitFor(`BDSDeepSeekVoice.settings.autoRead===false && fixture.settings.liveNativeAutoRead===false`,'Auto-read toggle did not persist');
    await cdp.click('[data-auto-read-toggle]');
    await cdp.waitFor(`BDSDeepSeekVoice.settings.autoRead===true`,'Auto-read toggle did not restore');
    await cdp.click('[data-inspect-native]');
    await cdp.waitFor(`document.querySelector('[data-native-status]').textContent.length > 0`,'Native inspect did not report status');
    await cdp.shot('improvement-4-native-inspect.png');
    await cdp.click('[data-diagnostics]');
    const diagnostics = JSON.parse(await cdp.evaluate(`fixture.clipboard`));
    assert.equal(diagnostics.panel,'bds-voice-panel');
    assert.ok(diagnostics.deepseekVoice && typeof diagnostics.deepseekVoice.autoRead === 'boolean');
    assert.ok(!JSON.stringify(diagnostics).includes('إدارة المشروعات'));
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.equal(await cdp.evaluate(`document.documentElement.scrollWidth <= innerWidth`),true);
    await cdp.shot('improvement-5-mobile-voice.png');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:1040,deviceScaleFactor:1,mobile:false});
    await cdp.click('[data-close]');
    await cdp.evaluate(`fixture.setTheme('light');document.documentElement.lang='en';document.documentElement.dir='ltr';BDSVoicePanel.open({locale:'en'});`);
    await cdp.waitFor(`document.querySelector('#bds-voice-panel dialog').open`, 'English voice panel did not open');
    await cdp.shot('improvement-6-english-light.png');
    await cdp.evaluate(`(() => { const select=document.querySelector('[data-language]'); select.value='en-US'; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await cdp.waitFor(`BDSVoicePanel.settings.language==='en-US' && fixture.settings.voiceLanguage==='en-US'`, 'Language select did not persist');
    assert.equal(await cdp.evaluate(`fixture.settings.voiceLanguageChosen`),true);
    await cdp.click('[data-close]');
    await cdp.evaluate(`BDSVoicePanel.open({locale:'en'})`);
    assert.equal(await cdp.evaluate(`document.querySelector('[data-language]').value`),'en-US');
    assert.deepEqual(errors,[],'No browser JavaScript exceptions');
    console.log(JSON.stringify({passed:true,screenshots:6,checks:['Arabic normalization','role filtering','original-text highlights','voice panel from quick access','DeepSeek read-aloud toggle','native inspect without playback','safe diagnostics','mobile overflow','English/light theme','language persistence']}));
  } finally { cdp.close(); }
})().catch((error)=>{console.error(error.stack);process.exitCode=1;});
