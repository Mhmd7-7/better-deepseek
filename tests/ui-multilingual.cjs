/* Actual Chromium DOM checks for the voice panel language control. */
const assert = require('node:assert/strict');
const { CDP } = require('./ui-improvements.cjs');
(async () => {
  const targets = await (await fetch('http://127.0.0.1:9228/json')).json();
  const tab = targets.find((item) => item.url.includes('improvements-fixture.html'));
  assert.ok(tab); const cdp = new CDP(tab.webSocketDebuggerUrl); await cdp.connect();
  const errors = [];
  cdp.socket.addEventListener('message',(event)=>{const data=JSON.parse(event.data);if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails.text);});
  async function choose(language) {
    await cdp.evaluate(`(() => {const node=document.querySelector('[data-language]');node.value=${JSON.stringify(language)};node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await cdp.waitFor(`BDSVoicePanel.settings.language===${JSON.stringify(language)} && fixture.settings.voiceLanguage===${JSON.stringify(language)}`, 'Language was not saved');
  }
  try {
    await cdp.send('Runtime.enable');await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:1100,deviceScaleFactor:1,mobile:false});
    await cdp.send('Page.reload',{ignoreCache:true});
    await cdp.waitFor(`globalThis.BDSSpeechLanguages && globalThis.BDSVoicePanel && document.querySelector('[data-language]')`, 'Language UI did not mount');
    await cdp.evaluate(`BDSVoicePanel.open({locale:'ar'})`);
    await cdp.waitFor(`document.querySelector('#bds-voice-panel dialog').open`, 'Voice panel did not open');
    assert.ok(await cdp.evaluate(`document.querySelector('[data-language]').options.length >= 72`));
    await choose('en-US');
    assert.equal(await cdp.evaluate(`fixture.settings.voiceLanguageChosen`),true);
    await cdp.shot('languages-1-english-listening.png');
    await cdp.evaluate(`(() => {const node=document.querySelector('[data-language]');node.value='custom';node.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-custom-tag]').value='xx<script>';})()`);
    await cdp.click('[data-apply-language]');assert.equal(await cdp.evaluate(`BDSVoicePanel.settings.language`),'en-US');
    await cdp.evaluate(`document.querySelector('[data-custom-tag]').value='sw-KE'`);await cdp.click('[data-apply-language]');
    await cdp.waitFor(`BDSVoicePanel.settings.language==='sw-KE'`, 'Custom language did not save');
    await choose('zh-TW');
    assert.ok(await cdp.evaluate(`document.querySelector('[data-language]').value==='zh-TW'`));
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.equal(await cdp.evaluate(`document.documentElement.scrollWidth <= innerWidth`),true);
    await cdp.shot('languages-2-mobile-chinese.png');
    await cdp.click('[data-close]');
    assert.equal(await cdp.evaluate(`document.querySelector('#bds-voice-panel dialog').open`),false);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,screenshots:2,checks:['71 common locales plus custom tag','language persistence','custom tag validation','Chinese locale selection','mobile overflow','close']}));
  } finally {cdp.close();}
})().catch((error)=>{console.error(error.stack);process.exitCode=1;});
