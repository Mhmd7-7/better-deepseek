const { test, expect } = require('@playwright/test');
const { buildSync } = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const { unzipSync, strFromU8 } = require('fflate');

const root = path.resolve(__dirname, '..');
const bundle = buildSync({ stdin: { contents: `
  import { initWorkspace } from './src/workspace/index.js';
  import { claimWorkspaceMessage, observeWorkspaceUserMessage } from './src/workspace/bridge.js';
  import { handleWorkspaceStore } from './src/workspace/background-store.js';
  import { runIsolated } from './src/workspace/runner-client.js';
  window.workspaceFixture = { initWorkspace, claimWorkspaceMessage, observeWorkspaceUserMessage, handleWorkspaceStore, runIsolated };
`, resolveDir: root }, bundle: true, format: 'iife', write: false, loader: { '.css': 'empty' } }).outputFiles[0].text;

async function load(page, { arabic = false } = {}) {
  await page.route('https://chat.deepseek.com/**', route => {
    const name = new URL(route.request().url()).pathname.slice(1);
    if (['task-sandbox.html','task-sandbox.js','task-worker.js'].includes(name)) {
      const type = name.endsWith('.html') ? 'text/html' : 'text/javascript';
      return route.fulfill({ contentType: type, body: fs.readFileSync(path.join(root,name)) });
    }
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="messages"></main><textarea id="chat-input"></textarea><button id="native-send" title="Send message">Send</button></body></html>` });
  });
  await page.goto('https://chat.deepseek.com/chat/s/workspace-test');
  await page.addStyleTag({ path: path.join(root, 'src/workspace/workspace.css') });
  await page.addScriptTag({ content: bundle });
  await page.evaluate(async arabic => {
    window.sentPrompts = [];
    window.chrome = {
      tabs: { get: async id => ({ id }) },
      storage: { local: { get: async () => ({}), set: async () => {} } },
      runtime: {
        getURL: name => 'https://chat.deepseek.com/' + name,
        sendMessage: async message => {
          if (message.type === 'bds-get-my-tab-id') return { tabId: 7 };
          if (message.type === 'BDS_WORKSPACE_STORE') {
            try { return { ok: true, value: await window.workspaceFixture.handleWorkspaceStore(message, {tab:{id:7},url:location.href}) }; }
            catch (error) { return {ok:false,error:error.message}; }
          }
          throw new Error('Unexpected request: '+message.type);
        },
      },
    };
    await window.workspaceFixture.initWorkspace({
      send: async (text, label, guard) => { if (!guard()) return false; window.sentPrompts.push(text); return true; },
      isGenerating: () => !!window.generating,
      role: node => node.dataset.role || 'assistant',
      settings: {locale:arabic?'ar':'en',syncLocale:false}, mcpServers: () => [],
    });
    window.deliverReply = (text, { streaming=false } = {}) => {
      let node = document.querySelector('.ds-message[data-streaming]');
      if (!node) {
        node = document.createElement('div'); node.className='ds-message'; node.dataset.role='assistant';
        const body=document.createElement('div'); body.className='ds-markdown'; node.append(body);
        document.querySelector('#messages').append(node);
      }
      node.querySelector('.ds-markdown').textContent=text;
      if(streaming) node.dataset.streaming='1'; else delete node.dataset.streaming;
      window.workspaceFixture.claimWorkspaceMessage(node,text,true,streaming);
    };
  }, arabic);
}
async function open(page) { await page.locator('.bds-ws-launch').click(); }
async function start(page, goal='Create a project') {
  await open(page);
  await page.locator('#bds-ws-goal').fill(goal);
  await page.getByRole('button',{name:'Start task',exact:true}).click();
  await expect.poll(() => page.evaluate(() => window.sentPrompts.length)).toBe(1);
  return page.evaluate(() => window.sentPrompts[0].match(/\[BDS_MANAGED_TASK ([^\]]+)\]/)[1]);
}
function call(run,id,name,args) { return `<BDS:TOOL run="${run}" id="${id}" name="${name}">${JSON.stringify(args)}</BDS:TOOL>`; }
async function deliver(page,text, options) { await page.evaluate(({text,options})=>window.deliverReply(text,options),{text,options}); }

test('a project task writes files, completes, and downloads a real ZIP', async ({page}) => {
  await load(page); const run = await start(page);
  await deliver(page,call(run,'readme','files.write',{name:'README.md',content:'# Project\nمرحبا'}) + call(run,'code','files.write',{name:'src/main.js',content:'console.log("hello")'}));
  await expect.poll(()=>page.evaluate(()=>window.sentPrompts.length)).toBe(2);
  await deliver(page,`<BDS:DONE run="${run}">Project ready</BDS:DONE>`);
  await open(page);
  await expect(page.locator('.bds-ws-state')).toContainText('Complete');
  await page.getByRole('tab',{name:'Files',exact:true}).click();
  await expect(page.locator('.bds-ws-file-list article')).toHaveCount(2);
  const downloading=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download results ZIP',exact:true}).click();
  const zip=unzipSync(new Uint8Array(fs.readFileSync(await (await downloading).path())));
  expect(strFromU8(zip['README.md'])).toContain('مرحبا');
  expect(strFromU8(zip['src/main.js'])).toContain('console.log');
});

test('streamed or duplicate tags never create a file twice',async({page})=>{
  await load(page);const run=await start(page);
  const text=call(run,'once','files.write',{name:'once.txt',content:'once'});
  await deliver(page,text.slice(0,-8),{streaming:true});
  await open(page);await page.getByRole('tab',{name:'Files',exact:true}).click();
  await expect(page.locator('.bds-ws-file-list article')).toHaveCount(0);
  await page.getByRole('button',{name:'Close workspace',exact:true}).click();
  await deliver(page,text);
  await expect.poll(()=>page.evaluate(()=>window.sentPrompts.length)).toBe(2);
  await deliver(page,text);
  await open(page);await page.getByRole('tab',{name:'Files',exact:true}).click();
  await expect(page.locator('.bds-ws-file-list article')).toHaveCount(1);
});

test('JavaScript executes without DOM or extension privileges and can be terminated',async({page})=>{
  await load(page);
  const value=await page.evaluate(()=>window.workspaceFixture.runIsolated({kind:'code',code:'console.log("مرحبا"); return {sum:2+3,dom:typeof document,extension:typeof chrome};'}));
  expect(value.value).toEqual({sum:5,dom:'undefined',extension:'undefined'});
  expect(value.logs).toEqual(['مرحبا']);
  const isolation=await page.evaluate(()=>window.workspaceFixture.runIsolated({kind:'code',code:'let network,storage;try{await fetch("https://blocked.test/");network="allowed";}catch(e){network="blocked";}try{indexedDB.open("leak");storage="allowed";}catch(e){storage=e.name;}return {network,storage};'}));
  expect(isolation.value).toEqual({network:'blocked',storage:'SecurityError'});
  const stopped=await page.evaluate(async()=>{
    const controller=new AbortController();
    const pending=window.workspaceFixture.runIsolated({kind:'code',code:'while(true){}'},{signal:controller.signal});
    setTimeout(()=>controller.abort(),300);
    try{await pending;return 'not stopped';}catch(e){return e.name;}
  });
  expect(stopped).toBe('AbortError');
  expect(await page.evaluate(()=>2+2)).toBe(4);
  const timeout=await page.evaluate(async()=>{
    try{await window.workspaceFixture.runIsolated({kind:'code',code:'while(true){}'},{timeoutMs:300});return 'no timeout';}catch(e){return e.message;}
  });
  expect(timeout).toContain('exceeded');
});

test('Office outputs contain valid DOCX, XLSX and PPTX structures and Arabic text',async({page})=>{
  await load(page);
  for(const format of ['docx','xlsx','pptx']){
    const result=await page.evaluate(async format=>{
      const output=await window.workspaceFixture.runIsolated({kind:'document',format,title:'تقرير تجريبي',paragraphs:['نتيجة موثقة'],rows:[['Name','Value'],['مرحبا',42]],slides:[{title:'مرحبا',text:'نتيجة موثقة'}]});
      return {bytes:Array.from(output.bytes),type:output.type};
    },format);
    const entries=unzipSync(Uint8Array.from(result.bytes));
    const paths={docx:'word/document.xml',xlsx:'xl/worksheets/sheet1.xml',pptx:'ppt/slides/slide1.xml'};
    expect(entries['[Content_Types].xml']).toBeTruthy();
    expect(strFromU8(entries[paths[format]])).toMatch(/مرحبا|نتيجة موثقة/);
    if(format==='docx'||format==='pptx'){
      const preview=await page.evaluate(({bytes,format})=>window.workspaceFixture.runIsolated({kind:'import',name:'output.'+format,bytes}),{bytes:result.bytes,format});
      expect(preview.text).toMatch(/مرحبا|نتيجة موثقة/);
    }
  }
});

test('CSV analysis can use selected full input bytes and create a spreadsheet',async({page})=>{
  await load(page);await open(page);await page.getByRole('tab',{name:'Files',exact:true}).click();
  const choosing=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Import files',exact:true}).click();
  await (await choosing).setFiles({name:'sales.csv',mimeType:'text/csv',buffer:Buffer.from('item,amount\na,10\nb,20\n')});
  await expect(page.locator('.bds-ws-file-list article')).toHaveCount(1);
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await page.getByRole('checkbox').check();
  await page.getByRole('tab',{name:'Task',exact:true}).click();
  await page.locator('#bds-ws-goal').fill('Analyze sales');
  await page.getByRole('button',{name:'Start task',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.sentPrompts.length)).toBe(1);
  const info=await page.evaluate(()=>{
    const prompt=window.sentPrompts[0];return {run:prompt.match(/\[BDS_MANAGED_TASK ([^\]]+)\]/)[1],file:JSON.parse(prompt.match(/Only these selected local files are available: (.*)/)[1])[0].id};
  });
  await deliver(page,call(info.run,'analysis','code.run',{fileIds:[info.file],code:`const sheet=XLSX.read(files[${JSON.stringify(info.file)}].bytes,{type:"array"}); const rows=XLSX.utils.sheet_to_json(sheet.Sheets[sheet.SheetNames[0]]); return {total:rows.reduce((sum,row)=>sum+Number(row.amount),0)};`}));
  await expect.poll(()=>page.evaluate(()=>window.sentPrompts.length)).toBe(2);
  expect(await page.evaluate(()=>window.sentPrompts[1])).toContain('"total":30');
  await deliver(page,call(info.run,'output','document.create',{format:'xlsx',title:'Sales',rows:[['Total'],[30]]}));
  await expect.poll(()=>page.evaluate(()=>window.sentPrompts.length)).toBe(3);
  await open(page);await page.getByRole('tab',{name:'Files',exact:true}).click();
  await expect(page.locator('.bds-ws-file-list article')).toHaveCount(2);
});

test('external actions need a trusted approval and stop ignores late replies',async({page})=>{
  await load(page);const run=await start(page);
  await deliver(page,call(run,'external','mcp.call',{serverUrl:'https://example.com/mcp',toolName:'publish',args:{text:'preview'}}));
  await open(page);
  await expect(page.locator('.bds-ws-state')).toContainText('Approval required');
  await expect(page.locator('.bds-ws-approval')).toContainText('publish');
  await page.evaluate(()=>document.querySelector('[data-action=approve]').click());
  await expect(page.locator('.bds-ws-state')).toContainText('Approval required');
  await page.getByRole('button',{name:'Stop task',exact:true}).click();
  await page.getByRole('button',{name:'Close workspace',exact:true}).click();
  await deliver(page,call(run,'late','files.write',{name:'late.txt',content:'must not exist'}));
  await open(page);await page.getByRole('tab',{name:'Files',exact:true}).click();
  await expect(page.locator('.bds-ws-file-list article')).toHaveCount(0);
  expect(await page.evaluate(()=>window.sentPrompts.length)).toBe(1);
});

test('Arabic mobile workspace has bounded layout and keyboard navigation',async({page})=>{
  await page.setViewportSize({width:360,height:780});await load(page,{arabic:true});await open(page);
  await expect(page.getByRole('heading',{name:'مهمتك من الفكرة إلى النتيجة'})).toBeVisible();
  await expect(page.locator('#bds-workspace')).toHaveAttribute('dir','rtl');
  await page.getByRole('tab',{name:'المهمة',exact:true}).focus();await page.keyboard.press('End');
  await expect(page.getByRole('tab',{name:'سجل التنفيذ',exact:true})).toBeFocused();
  const bounds=await page.getByRole('dialog').boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(360);
  await page.screenshot({path:test.info().outputPath('workspace-arabic-mobile.png')});
});

test('reload preserves results, requires explicit resume, and accepts new turns without replaying old writes',async({page})=>{
  await load(page);const run=await start(page);
  await deliver(page,call(run,'first','files.write',{name:'first.txt',content:'first'}));
  await expect.poll(()=>page.evaluate(()=>window.sentPrompts.length)).toBe(2);
  await load(page);await open(page);
  await expect(page.locator('.bds-ws-state')).toContainText('Interrupted');
  expect(await page.evaluate(()=>window.sentPrompts.length)).toBe(0);
  await page.getByRole('button',{name:'Continue task',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.sentPrompts.length)).toBe(1);
  await deliver(page,call(run,'second','files.write',{name:'second.txt',content:'second'}));
  await expect.poll(()=>page.evaluate(()=>window.sentPrompts.length)).toBe(2);
  await open(page);await page.getByRole('tab',{name:'Files',exact:true}).click();
  await expect(page.locator('.bds-ws-file-list article')).toHaveCount(2);
});

test('a task started on the homepage binds once to its newly created conversation',async({page})=>{
  await load(page);await page.evaluate(()=>history.pushState({},'', '/'));
  const run=await start(page);
  await page.evaluate(()=>history.pushState({},'', '/chat/s/new-conversation'));
  await deliver(page,call(run,'bound','files.write',{name:'new.txt',content:'new conversation'}));
  await expect.poll(()=>page.evaluate(()=>window.sentPrompts.length)).toBe(2);
  await open(page);await page.getByRole('tab',{name:'Files',exact:true}).click();
  await expect(page.locator('.bds-ws-file-list')).toContainText('new.txt');
});

test('changing conversations pauses the task and prevents a late tool call',async({page})=>{
  await load(page);const run=await start(page);
  await page.evaluate(()=>{history.pushState({},'', '/chat/s/other');window.dispatchEvent(new CustomEvent('bds:urlChanged'));});
  await open(page);await expect(page.locator('.bds-ws-state')).toContainText('Paused');
  await page.getByRole('button',{name:'Close workspace',exact:true}).click();
  await deliver(page,call(run,'late','files.write',{name:'wrong.txt',content:'wrong conversation'}));
  await open(page);await page.getByRole('tab',{name:'Files',exact:true}).click();
  await expect(page.locator('.bds-ws-file-list article')).toHaveCount(0);
});
