import { describe, it, expect, vi } from 'vitest';
import { TaskEngine } from './task-engine.js';
import { parseTaskReply, validateCall } from './protocol.js';
import { safePath, createTools } from './tools.js';
import { fetchWorkspacePage } from './network.js';

function fixture(options = {}) {
  let saved;
  const store = {
    createTask: vi.fn(async task => (saved = structuredClone(task))),
    saveTask: vi.fn(async task => (saved = structuredClone(task))),
    listTasks: vi.fn(async () => saved ? [saved] : []),
    listFiles: vi.fn(async () => []),
    claimTask: vi.fn(async () => saved),
  };
  const send = vi.fn(async () => true);
  const execute = vi.fn(async call => ({ text: call.args.content || 'result' }));
  const engine = new TaskEngine({ store, execute, send, conversation: () => '/chat/s/test', ...options });
  return { engine, store, send, execute };
}
const reply = (engine, id = 'c1', tool = 'files.write', args = { name: 'a.txt', content: 'hello' }) =>
  `<BDS:TOOL run="${engine.task.id}" id="${id}" name="${tool}">${JSON.stringify(args)}</BDS:TOOL>`;

describe('managed task lifecycle', () => {
  it('executes a call once across repeated DOM updates and duplicate tool IDs', async () => {
    const { engine, execute, send } = fixture();
    await engine.start('Write a file');
    const text = reply(engine);
    await engine.ingest(text, 'turn1');
    await engine.ingest(text, 'turn1');
    await engine.ingest(text, 'turn2');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(engine.task.status).toBe('paused');
  });
  it('stops an in-flight operation and never sends its late result', async () => {
    let finish;
    const { engine, send } = fixture({ execute: () => new Promise(resolve => { finish = resolve; }) });
    await engine.start('Run');
    const processing = engine.ingest(reply(engine), 'turn1');
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const signal = engine.controller.signal;
    await engine.stop();
    expect(signal.aborted).toBe(true);
    finish({ text: 'late' });
    await processing;
    expect(send).toHaveBeenCalledTimes(1);
    expect(engine.task.status).toBe('cancelled');
  });
  it('pauses at the call budget and continues only after explicit resume', async () => {
    const { engine, execute } = fixture({ budget: 1 });
    await engine.start('Two files');
    await engine.ingest(reply(engine, 'c1') + reply(engine, 'c2'), 'turn1');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(engine.task.status).toBe('paused');
    await engine.resume();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(engine.task.status).toBe('awaiting_model');
    expect(engine.task.steps.every(step=>step.delivered)).toBe(true);
  });
  it('does not repeat a failed write until Retry is explicitly requested', async () => {
    const { engine, execute } = fixture();
    execute.mockRejectedValueOnce(new Error('Storage full'));
    await engine.start('Write');
    await engine.ingest(reply(engine), 'turn1');
    expect(engine.task.steps[0].status).toBe('failed');
    await expect(engine.resume()).rejects.toThrow('Retry');
    expect(execute).toHaveBeenCalledTimes(1);
    await engine.resume({ retry: true });
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it('asks for a code repair once and pauses instead of looping on repeated errors', async () => {
    const { engine, execute, send } = fixture();
    execute.mockRejectedValue(new Error('Syntax error'));
    await engine.start('Calculate');
    await engine.ingest(reply(engine,'bad','code.run',{code:'bad code'}),'turn1');
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toContain('BDS_TOOL_ERROR');
    expect(engine.task.status).toBe('awaiting_model');
    await engine.ingest(reply(engine,'stillbad','code.run',{code:'still bad'}),'turn2');
    expect(engine.task.status).toBe('paused');
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('retains stop controls when repairing a task recovered from a closed tab', async () => {
    const { engine, execute, store } = fixture();
    execute.mockRejectedValueOnce(new Error('Write failed'));
    await engine.start('Recover');
    await engine.ingest(reply(engine),'turn1');
    engine.task.owned = false;
    store.claimTask.mockResolvedValueOnce({ownerTabId:9});
    await engine.repair();
    expect(engine.task.ownerTabId).toBe(9);
    expect(engine.task.owned).toBeUndefined();
    expect(engine.task.status).toBe('awaiting_model');
  });
  it('requires approval before external tools and records unknown results on stop', async () => {
    let finish;
    const execute = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const { engine, send } = fixture({ execute });
    await engine.start('External action');
    await engine.ingest(reply(engine, 'ext', 'mcp.call', { serverUrl: 'https://example.com/mcp', toolName: 'publish' }), 'turn1');
    expect(engine.task.status).toBe('needs_approval');
    expect(execute).not.toHaveBeenCalled();
    const processing = engine.resume({ approve: true });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await engine.stop();
    finish({ text: 'remote result' });
    await processing;
    expect(engine.task.steps[0].status).toBe('interrupted');
    expect(engine.task.steps[0].error).toContain('unknown');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('restores unfinished tasks as interrupted without sending or executing', async () => {
    const { engine, store, execute, send } = fixture();
    await engine.start('Restore');
    const next = fixture({ store });
    await next.engine.restore();
    expect(next.engine.task.status).toBe('interrupted');
    expect(next.send).not.toHaveBeenCalled();
    expect(next.execute).not.toHaveBeenCalled();
  });
  it('rejects replies from another conversation and completes only on a matching DONE', async () => {
    let conversation = '/chat/s/test';
    const { engine, execute } = fixture({ conversation: () => conversation });
    await engine.start('Task');
    conversation = '/chat/s/other';
    await engine.ingest(reply(engine), 'turn1');
    expect(execute).not.toHaveBeenCalled();
    conversation = '/chat/s/test';
    await engine.ingest(`<BDS:DONE run="${engine.task.id}">Finished</BDS:DONE>`, 'turn2');
    expect(engine.task.status).toBe('complete');
    expect(engine.task.summary).toBe('Finished');
  });
});

describe('tool protocol and local boundaries', () => {
  const call = '<BDS:TOOL run="r1" id="c1" name="code.run">{"code":"return `مرحبا`"}</BDS:TOOL>';
  it('preserves code payloads containing template strings', () => {
    expect(parseTaskReply(call, 'r1', 't1').calls[0].args.code).toBe('return `مرحبا`');
  });
  it('ignores incomplete tags, fenced examples, blockquotes, inline quotes and wrong run IDs', () => {
    for (const text of [call.slice(0,-11), '```xml\n'+call+'\n```', '> '+call, '`'+call.replaceAll('`','')+'`']) {
      expect(parseTaskReply(text,'r1','t1').calls).toEqual([]);
    }
    expect(parseTaskReply(call,'other','t1').calls).toEqual([]);
  });
  it('supports complete legacy file tags and rejects malformed MCP JSON', () => {
    const result = parseTaskReply('<BDS:create_file fileName="src/a.js">return 1</BDS:create_file>', 'r1','t1');
    expect(result.calls[0].tool).toBe('files.write');
    expect(() => parseTaskReply('<BDS:AUTO:MCP url="https://example.com" tool="write" args=\'{bad}\'></BDS:AUTO:MCP>', 'r1','t1')).toThrow();
  });
  it('validates tool names, argument types and URL protocols', () => {
    expect(() => validateCall({ id:'a', tool:'terminal', args:{} })).toThrow('Unsupported');
    expect(() => validateCall({ id:'a', tool:'web.read', args:{url:'file:///etc/passwd'} })).toThrow();
    expect(() => validateCall({ id:'a', tool:'web.read', args:[] })).toThrow();
  });
  it('allows project paths and empty files, while rejecting traversal and reserved names', () => {
    expect(safePath('src/main.js')).toBe('src/main.js');
    expect(safePath('.gitignore')).toBe('.gitignore');
    for (const name of ['../a','/a','a/../../b','CON.txt','.git/config','a\u202eb.js']) expect(() => safePath(name)).toThrow();
    expect(validateCall({ id:'a', tool:'files.write', args:{name:'.gitignore',content:''} })).toBeTruthy();
  });
  it('never reads or passes an unselected input file to a code worker', async () => {
    const store = { getFile:vi.fn(), listFiles:vi.fn(async () => [{id:'secret',name:'secret.txt'}]) };
    const runner = vi.fn();
    const execute = createTools({ store, runner });
    const context = { task:{id:'t1', fileIds:[]}, signal:new AbortController().signal };
    await expect(execute({tool:'code.run',args:{code:'return files',fileIds:['secret']}},context)).rejects.toThrow('selected');
    await expect(execute({tool:'files.read',args:{fileId:'secret'}},context)).rejects.toThrow('selected');
    expect(store.getFile).not.toHaveBeenCalled(); expect(runner).not.toHaveBeenCalled();
  });
  it('treats a successful MCP transport with an error result as a failed tool', async () => {
    chrome.runtime.sendMessage.mockResolvedValueOnce({ok:true,result:{isError:true,content:[{type:'text',text:'Service rejected this action'}]}});
    const execute = createTools({store:{},mcpServers:()=>[{serverUrl:'https://example.com/mcp',enabled:true}]});
    await expect(execute({tool:'mcp.call',approved:true,args:{serverUrl:'https://example.com/mcp',toolName:'publish'}},
      {task:{id:'task',fileIds:[]},signal:new AbortController().signal})).rejects.toThrow('Service rejected');
  });
});

describe('cancellable read-only network retries', () => {
  it('does not retry a policy or permission denial', async () => {
    const send = vi.fn(async () => ({ok:false,status:403,error:'Forbidden'}));
    await expect(fetchWorkspacePage('https://example.com',new AbortController().signal,send)).rejects.toThrow('Forbidden');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('sends cancellation and ignores late successful responses', async () => {
    let finish;
    const send = vi.fn(message => message.type.endsWith('CANCEL') ? Promise.resolve({ok:true}) : new Promise(resolve => { finish=resolve; }));
    const controller = new AbortController();
    const pending = fetchWorkspacePage('https://example.com',controller.signal,send);
    controller.abort(); finish({ok:true,html:'late'});
    await expect(pending).rejects.toMatchObject({name:'AbortError'});
    expect(send.mock.calls.some(([message]) => message.type==='BDS_WORKSPACE_CANCEL')).toBe(true);
  });
});
