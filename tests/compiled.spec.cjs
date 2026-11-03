const { test, expect } = require('@playwright/test');
const { buildSync } = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const root=path.resolve(__dirname,'..');
const backend=buildSync({stdin:{contents:`import {handleWorkspaceStore} from './src/workspace/background-store.js'; import {handleWorkspaceFetch} from './src/workspace/network.js'; window.fixtureBackend={handleWorkspaceStore,handleWorkspaceFetch};`,resolveDir:root},bundle:true,format:'iife',write:false}).outputFiles[0].text;
const call=(run,id,name,args)=>`<BDS:TOOL run="${run}" id="${id}" name="${name}">${JSON.stringify(args)}</BDS:TOOL>`;

test('rebuilt content, native composer, task tools, research sources and existing quick access work together',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='bds-assets.test'){
      const file=path.join(root,url.pathname);
      if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:'Missing asset'});
      const ext=path.extname(file);
      return route.fulfill({contentType:ext==='.html'?'text/html':ext==='.css'?'text/css':'text/javascript',body:fs.readFileSync(file),headers:{'access-control-allow-origin':'*'}});
    }
    if(url.hostname==='chat.deepseek.com')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'tests/e2e/fixtures/mock-deepseek.html'))});
    if(url.hostname==='lite.duckduckgo.com')return route.fulfill({contentType:'text/html',headers:{'access-control-allow-origin':'*'},body:'<html><table><tr><td><a class="result-link" href="https://evidence.test/article">Verified fixture source</a></td></tr><tr><td class="result-snippet">A concrete documented result about the research topic.</td></tr></table></html>'});
    if(url.hostname==='evidence.test')return route.fulfill({contentType:'text/html',headers:{'access-control-allow-origin':'*'},body:'<html><head><title>Verified fixture source</title></head><body><article><h1>Research evidence</h1><p>'+('The recorded result is 42, supported by the following detailed methodology. '.repeat(12))+'</p></article></body></html>'});
    return route.fulfill({status:200,contentType:'application/json',body:'{}',headers:{'access-control-allow-origin':'*'}});
  });
  await page.goto('https://chat.deepseek.com/chat/s/compiled');
  await page.addScriptTag({content:backend});
  await page.evaluate(manifest=>{
    const listeners=[];const data={bds_settings:{locale:'en',syncLocale:false}};
    window.chrome={
      tabs:{get:async id=>({id})},
      storage:{onChanged:{addListener:f=>listeners.push(f),removeListener:f=>{const i=listeners.indexOf(f);if(i>=0)listeners.splice(i,1);}},local:{
        get(keys,callback){const result=typeof keys==='string'?{[keys]:data[keys]}:Array.isArray(keys)?Object.fromEntries(keys.map(k=>[k,data[k]])):{...data};if(callback)queueMicrotask(()=>callback(result));return Promise.resolve(result);},
        set(values,callback){const changes={};for(const key in values){changes[key]={oldValue:data[key],newValue:values[key]};data[key]=values[key];}queueMicrotask(()=>listeners.forEach(f=>f(changes,'local')));callback?.();return Promise.resolve();},
        remove(keys,callback){for(const key of Array.isArray(keys)?keys:[keys])delete data[key];callback?.();return Promise.resolve();},
      }},
      runtime:{id:'fixture',getURL:name=>'https://bds-assets.test/'+name,getManifest:()=>manifest,onMessage:{addListener(){}},
        sendMessage(message,callback){
          const sender={tab:{id:9},url:location.href};
          const result=(async()=>{
            if(message.type==='BDS_WORKSPACE_STORE'){try{return{ok:true,value:await window.fixtureBackend.handleWorkspaceStore(message,sender)};}catch(e){return{ok:false,error:e.message};}}
            if(message.type.startsWith('BDS_WORKSPACE_'))return window.fixtureBackend.handleWorkspaceFetch(message,sender);
            if(message.type==='bds-get-my-tab-id')return{tabId:9};
            if(message.type==='bds-mcp-list-tools')return{ok:true,tools:[]};
            return {ok:true,success:true,locales:{},background:{success:true}};
          })();
          if(callback)result.then(callback);return result;
        },
      },
    };
  },JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8')));
  await page.addStyleTag({path:path.join(root,'content.css')});
  await page.addScriptTag({path:path.join(root,'content.js')});
  await page.addStyleTag({path:path.join(root,'enhancements/quick-access.css')});
  await page.addScriptTag({path:path.join(root,'enhancements/conversation-tools.js')});
  await page.addScriptTag({path:path.join(root,'enhancements/quick-access.js')});
  await expect(page.locator('#bds-toggle')).toBeVisible();
  await expect(page.locator('.bds-plus-btn')).toBeVisible();
  await expect(page.locator('.bds-qa-launcher')).toBeVisible();
  await page.locator('.bds-ws-launch').click();
  await page.locator('#bds-ws-goal').fill('Research a documented result and produce a Word report');
  await page.getByRole('button',{name:'Start task',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__mockDeepSeek.lastSubmittedText)).toContain('[BDS_MANAGED_TASK');
  const run=await page.evaluate(()=>window.__mockDeepSeek.lastSubmittedText.match(/\[BDS_MANAGED_TASK ([^\]]+)\]/)[1]);
  await page.evaluate(text=>window.__mockDeepSeek.addAssistantMessage(text),call(run,'search','web.search',{query:'documented research result'}));
  await expect.poll(()=>page.evaluate(()=>window.__mockDeepSeek.getSendCount())).toBe(2);
  expect(await page.evaluate(()=>window.__mockDeepSeek.lastSubmittedText)).toContain('https://evidence.test/article');
  await page.evaluate(text=>window.__mockDeepSeek.addAssistantMessage(text),call(run,'read','web.read',{url:'https://evidence.test/article'}));
  await expect.poll(()=>page.evaluate(()=>window.__mockDeepSeek.getSendCount())).toBe(3);
  await page.evaluate(text=>window.__mockDeepSeek.addAssistantMessage(text),call(run,'report','document.create',{format:'docx',title:'Research report',paragraphs:['The result is 42. Source: https://evidence.test/article']}));
  await expect.poll(()=>page.evaluate(()=>window.__mockDeepSeek.getSendCount())).toBe(4);
  await page.evaluate(text=>window.__mockDeepSeek.addAssistantMessage(text),`<BDS:DONE run="${run}">Research report is ready, with cited evidence.</BDS:DONE>`);
  await page.locator('.bds-ws-launch').click();
  await expect(page.locator('.bds-ws-state')).toContainText('Complete');
  await page.getByRole('tab',{name:'Files',exact:true}).click();
  await expect(page.locator('.bds-ws-file-list')).toContainText('document.docx');
  await page.getByRole('button',{name:'Close workspace',exact:true}).click();
  await page.locator('.bds-qa-launcher').click();
  await expect(page.locator('#bds-qa-dialog')).toBeVisible();
  expect(errors).toEqual([]);
});
