import './workspace.css';
import { TaskEngine } from './task-engine.js';
import { WorkspaceStore, TERMINAL } from './storage.js';
import { createTools, safePath } from './tools.js';
import { runIsolated } from './runner-client.js';
import { registerWorkspace } from './bridge.js';

const COPY = {
  en: {
    open: 'Task workspace', history: 'Previous tasks', title: 'Your task, from start to result', goal: 'What would you like DeepSeek to achieve?',
    start: 'Start task', close: 'Close workspace', task: 'Task', steps: 'Steps', files: 'Files', log: 'Execution log',
    import: 'Import files', zip: 'Download results ZIP', stop: 'Stop task', resume: 'Continue task', retry: 'Retry failed step',
    approve: 'Approve external action', fix: 'Ask DeepSeek to fix', new: 'New task', use: 'Share with task', preview: 'Preview', download: 'Download', remove: 'Remove',
    empty: 'No task yet. Describe a concrete goal and optionally select input files.', noFiles: 'No files yet.',
    privacy: 'Selected inputs and generated outputs stay in this extension. Only selected files may be sent to this DeepSeek conversation.',
    limits: 'TXT, MD, CSV, JSON, XLSX · 20 MB per file · 100 MB per task',
    pending: 'Ready', awaiting_model: 'Waiting for DeepSeek', running: 'Working', paused: 'Paused', needs_approval: 'Approval required',
    interrupted: 'Interrupted — explicit resume required', cancelled: 'Stopped', complete: 'Complete', queued: 'Queued', failed: 'Failed',
    previewHint: 'Limited preview. Download preserves the complete file.', external: 'This action calls a configured external MCP service. Check the tool and arguments before approving.',
    noResults: 'No generated files to package', imported: 'Files imported. Select which ones the task may read.',
    changed: 'Conversation changed. Return to the task conversation to continue.',
  },
  ar: {
    open: 'مساحة المهام', history: 'المهام السابقة', title: 'مهمتك من الفكرة إلى النتيجة', goal: 'ما النتيجة التي تريد من DeepSeek إنجازها؟',
    start: 'ابدأ المهمة', close: 'إغلاق مساحة المهام', task: 'المهمة', steps: 'الخطوات', files: 'الملفات', log: 'سجل التنفيذ',
    import: 'استيراد ملفات', zip: 'تنزيل النتائج ZIP', stop: 'إيقاف المهمة', resume: 'متابعة المهمة', retry: 'إعادة محاولة الخطوة',
    approve: 'الموافقة على الإجراء الخارجي', fix: 'طلب إصلاح من DeepSeek', new: 'مهمة جديدة', use: 'مشاركة مع المهمة', preview: 'معاينة', download: 'تنزيل', remove: 'إزالة',
    empty: 'لا توجد مهمة بعد. اكتب نتيجة محددة، واختر ملفات الإدخال عند الحاجة.', noFiles: 'لا توجد ملفات بعد.',
    privacy: 'تُحفظ الملفات داخل الإضافة. الملفات التي تختار مشاركتها فقط يمكن إرسال محتواها إلى محادثة DeepSeek الحالية.',
    limits: 'TXT، MD، CSV، JSON، XLSX · 20MB للملف · 100MB للمهمة',
    pending: 'جاهز', awaiting_model: 'بانتظار DeepSeek', running: 'جارٍ التنفيذ', paused: 'متوقفة مؤقتًا', needs_approval: 'تحتاج موافقة',
    interrupted: 'انقطع التنفيذ — يلزم الاستئناف', cancelled: 'أُوقفت', complete: 'مكتملة', queued: 'في الانتظار', failed: 'فشلت',
    previewHint: 'هذه معاينة محدودة. التنزيل يحتفظ بالملف كاملًا.', external: 'سيُستدعى خادم MCP خارجي أعددته مسبقًا. راجع اسم الأداة والمدخلات قبل الموافقة.',
    noResults: 'لا توجد ملفات ناتجة لتجميعها', imported: 'تم استيراد الملفات. اختر الملفات التي تسمح للمهمة بقراءتها.',
    changed: 'تغيّرت المحادثة. عُد إلى محادثة المهمة للمتابعة.',
  },
};

export async function initWorkspace({ send, isGenerating, role, settings, mcpServers }) {
  if (document.getElementById('bds-workspace')) return;
  const store = new WorkspaceStore();
  const tab = await chrome.runtime.sendMessage({ type: 'bds-get-my-tab-id' });
  const conversation = () => location.pathname === '/' ? `pending:${tab?.tabId || 'tab'}` : location.pathname;
  let draftId = crypto.randomUUID();
  let files = [];
  let selected = new Set();
  let activeTab = 'task';
  let baseline = new WeakSet(document.querySelectorAll('.ds-message'));
  const claimed = new WeakSet();
  const messageStates = new WeakMap();
  const notes = new Map();
  let locale = settings?.syncLocale ? navigator.language : settings?.locale || navigator.language;
  let language = /^ar\b/i.test(locale) ? 'ar' : 'en';
  let binding = null;
  let sending = false;
  let responseExpected = false;
  let pickingFiles = false;
  let initialized = false;
  const root = document.createElement('div');
  root.id = 'bds-workspace';
  root.innerHTML = `<button type="button" class="bds-ws-launch" data-action="open"><span data-label="open"></span><span class="bds-ws-indicator" aria-hidden="true"></span></button>
    <dialog aria-labelledby="bds-ws-title"><header><div><span class="bds-ws-brand">BDS WORKSPACE</span><h2 id="bds-ws-title" data-label="title"></h2></div><button type="button" data-action="close" aria-label="Close">×</button></header>
    <nav role="tablist" aria-label="Workspace"><button type="button" role="tab" data-tab="task" aria-controls="bds-ws-task" id="bds-ws-task-tab" data-label="task"></button><button type="button" role="tab" data-tab="steps" aria-controls="bds-ws-steps" id="bds-ws-steps-tab" data-label="steps"></button><button type="button" role="tab" data-tab="files" aria-controls="bds-ws-files" id="bds-ws-files-tab" data-label="files"></button><button type="button" role="tab" data-tab="log" aria-controls="bds-ws-log" id="bds-ws-log-tab" data-label="log"></button></nav>
    <div class="bds-ws-state" role="status" aria-live="polite"></div>
    <section id="bds-ws-task" role="tabpanel" aria-labelledby="bds-ws-task-tab"><label for="bds-ws-goal" data-label="goal"></label><textarea id="bds-ws-goal" rows="4" maxlength="12000"></textarea><p class="bds-ws-empty" data-label="empty"></p><div class="bds-ws-controls"><button type="button" data-action="start" data-label="start"></button><button type="button" data-action="stop" data-label="stop"></button><button type="button" data-action="resume" data-label="resume"></button><button type="button" data-action="retry" data-label="retry"></button><button type="button" data-action="fix" data-label="fix"></button><button type="button" data-action="approve" data-label="approve"></button><button type="button" data-action="new" data-label="new"></button></div><div class="bds-ws-approval" hidden><p data-label="external"></p><pre></pre></div><p class="bds-ws-reason"></p><pre class="bds-ws-summary"></pre></section>
    <section id="bds-ws-steps" role="tabpanel" aria-labelledby="bds-ws-steps-tab" hidden><ol></ol></section>
    <section id="bds-ws-files" role="tabpanel" aria-labelledby="bds-ws-files-tab" hidden><p data-label="privacy"></p><p class="bds-ws-muted" data-label="limits"></p><div class="bds-ws-controls"><button type="button" data-action="import" data-label="import"></button><button type="button" data-action="zip" data-label="zip"></button></div><input type="file" multiple accept=".txt,.md,.csv,.json,.xlsx" hidden><div class="bds-ws-file-list"></div><div class="bds-ws-preview" hidden><p data-label="previewHint"></p><pre tabindex="0"></pre></div></section>
    <section id="bds-ws-log" role="tabpanel" aria-labelledby="bds-ws-log-tab" hidden><pre></pre><h3 data-label="history"></h3><div class="bds-ws-history"></div></section>
    <p class="bds-ws-error" role="alert"></p><footer><button type="button" data-action="language">العربية / English</button><span>0.2.0</span></footer></dialog>`;
  document.body.append(root);
  const dialog = root.querySelector('dialog');
  const goal = root.querySelector('textarea');
  const errorBox = root.querySelector('.bds-ws-error');
  const label = () => COPY[language];
  const report = error => { errorBox.textContent = error.message || String(error); };
  const fileTaskId = () => engine.task?.id || draftId;

  const engine = new TaskEngine({ store, conversation, execute: createTools({ store, mcpServers }),
    send: async (prompt, guard) => {
      baseline = new WeakSet(document.querySelectorAll('.ds-message'));
      responseExpected = true;
      dialog.close();
      sending = true;
      try { return await send(prompt, 'Managed task', guard); } finally { sending = false; }
    }, onChange: () => { render(); refreshFiles().catch(report); refreshHistory().catch(report); },
  });

  function translate() {
    root.lang = language; root.dir = language === 'ar' ? 'rtl' : 'ltr';
    root.querySelectorAll('[data-label]').forEach(node => { node.textContent = label()[node.dataset.label]; });
    root.querySelector('[data-action="close"]').setAttribute('aria-label', label().close);
    goal.placeholder = label().goal;
    render(); renderFiles();
  }
  function selectTab(name) {
    activeTab = name;
    root.querySelectorAll('[data-tab]').forEach(button => {
      const selected = button.dataset.tab === name;
      button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    });
    root.querySelectorAll('[role="tabpanel"]').forEach(panel => { panel.hidden = panel.id !== `bds-ws-${name}`; });
  }
  function render() {
    const task = engine.task;
    const text = label()[task?.status || 'pending'] || task?.status;
    for (const [node, {button:note, runId, final}] of notes) {
      if (!node.isConnected) { notes.delete(node); continue; }
      if (task?.id !== runId) continue;
      note.textContent = final && task?.status === 'complete' ? task.summary : `${label().open} · ${text}`;
    }
    root.querySelector('.bds-ws-state').textContent = task ? `${text} · ${task.used}/${task.limit}` : label().empty;
    root.querySelector('.bds-ws-indicator').textContent = task && !TERMINAL.has(task.status) ? '●' : '';
    const canStart = !task;
    goal.readOnly = !!task;
    if (task) goal.value = task.goal;
    const show = (action, visible) => { root.querySelector(`[data-action="${action}"]`).hidden = !visible; };
    show('start', canStart); show('stop', task && !TERMINAL.has(task.status) && task.owned !== false);
    show('resume', task && ['paused','interrupted'].includes(task.status));
    show('retry', task && task.steps.some(s => ['failed','interrupted'].includes(s.status)) && ['paused','interrupted'].includes(task.status));
    show('fix', task && task.steps.some(s => s.status === 'failed') && ['paused','interrupted'].includes(task.status));
    show('approve', task?.status === 'needs_approval');
    show('new', task && TERMINAL.has(task.status));
    root.querySelector('.bds-ws-empty').hidden = !!task;
    root.querySelector('.bds-ws-reason').textContent = task?.reason || '';
    root.querySelector('.bds-ws-summary').textContent = task?.summary || '';
    const approval = root.querySelector('.bds-ws-approval');
    approval.hidden = task?.status !== 'needs_approval';
    approval.querySelector('pre').textContent = approval.hidden ? '' : JSON.stringify(task.steps.find(s => s.status === 'queued'), null, 2);
    const list = root.querySelector('#bds-ws-steps ol');
    list.replaceChildren();
    for (const step of task?.steps || []) {
      const item = document.createElement('li');
      item.textContent = `${step.tool} — ${label()[step.status] || step.status}${step.result?.file ? ` · ${step.result.file.name}` : ''}${step.error ? ` · ${step.error}` : ''}`;
      list.append(item);
    }
    // Diagnostics deliberately omit tool arguments, prompts and file contents.
    root.querySelector('#bds-ws-log pre').textContent = (task?.steps || []).map(step => `${step.tool} | ${step.status} | ${step.durationMs || 0}ms | attempts:${step.attempts}`).join('\n');
    const sources = [...new Map((task?.sources || []).map(source => [source.url, source])).values()];
    for (const source of sources) {
      try {
        const url = new URL(source.url);
        if (!['http:', 'https:'].includes(url.protocol)) continue;
        const a = document.createElement('a'); a.textContent = source.title || url.hostname; a.href = url.href; a.target = '_blank'; a.rel = 'noopener noreferrer';
        const item = document.createElement('li'); item.append(a); list.append(item);
      } catch {}
    }
    selectTab(activeTab);
  }
  async function refreshFiles() {
    const id = fileTaskId();
    const next = await store.listFiles(id);
    if (fileTaskId() !== id) return;
    files = next;
    if (engine.task) selected = new Set(engine.task.fileIds);
    renderFiles();
  }
  async function selectPastTask(id) {
    if (engine.task && engine.task.id !== id && !TERMINAL.has(engine.task.status)) throw new Error('Finish or stop the current task before opening another');
    const task = (await store.listTasks()).find(task => task.id === id && task.conversationId === conversation());
    if (!task) throw new Error('Task not found in this conversation');
    engine.task = task;
    selected = new Set(task.fileIds);
    root.querySelector('.bds-ws-preview').hidden = true;
    render(); await refreshFiles(); open();
  }
  async function refreshHistory() {
    const tasks = (await store.listTasks()).filter(task => task.conversationId === conversation()).sort((a,b)=>b.createdAt-a.createdAt);
    const list = root.querySelector('.bds-ws-history');
    list.replaceChildren();
    for (const task of tasks) {
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = `${task.goal.slice(0,80)} · ${label()[task.status] || task.status}`;
      button.disabled = !!engine.task && engine.task.id !== task.id && !TERMINAL.has(engine.task.status);
      button.addEventListener('click', event => { if (event.isTrusted) selectPastTask(task.id).catch(report); });
      list.append(button);
    }
  }
  function renderFiles() {
    const list = root.querySelector('.bds-ws-file-list');
    const focus = document.activeElement?.dataset.file;
    list.replaceChildren();
    if (!files.length) { const p = document.createElement('p'); p.textContent = label().noFiles; list.append(p); }
    for (const file of files) {
      const row = document.createElement('article');
      const name = document.createElement('strong'); name.textContent = file.name; name.dir = 'auto';
      const info = document.createElement('span'); info.textContent = `${Math.ceil(file.size / 1024)} KB`;
      row.append(name, info);
      if (!file.generated) {
        const wrapper = document.createElement('label');
        const input = document.createElement('input'); input.type = 'checkbox'; input.checked = selected.has(file.id); input.dataset.file = file.id;
        wrapper.append(input, label().use); row.append(wrapper);
        input.addEventListener('change', event => {
          if (!event.isTrusted) { input.checked = selected.has(file.id); return; }
          if (input.checked) selected.add(file.id); else selected.delete(file.id);
          if (engine.task) { engine.task.fileIds = [...selected]; engine.persist().catch(report); }
        });
      }
      const controls = document.createElement('div');
      for (const action of ['preview','download','remove']) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label()[action];
        button.disabled = action === 'remove' && !!engine.task && !TERMINAL.has(engine.task.status);
        button.addEventListener('click', event => { if (event.isTrusted) handleFile(action, file).catch(report); });
        controls.append(button);
      }
      row.append(controls); list.append(row);
    }
    if (focus) Array.from(list.querySelectorAll('[data-file]')).find(node => node.dataset.file === focus)?.focus();
  }
  async function handleFile(action, file) {
    if (action === 'remove') { await store.removeFile(file.id); selected.delete(file.id); await refreshFiles(); return; }
    const data = await store.getFile(file.id);
    if (action === 'download') { download(data.bytes, file.name, file.type); return; }
    const preview = root.querySelector('.bds-ws-preview');
    const result = await runIsolated({ kind: 'import', name: file.name, bytes: data.bytes });
    preview.querySelector('pre').textContent = result.text.slice(0,10000);
    preview.hidden = false;
  }
  function download(bytes, name, type) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function bundle() {
    const output = files.filter(file => file.generated);
    if (!output.length) throw new Error(label().noResults);
    const entries = Object.create(null);
    for (const file of output) {
      let name = safePath(file.name);
      if (Object.hasOwn(entries, name)) name = `${file.id.slice(0,8)}-${name}`;
      entries[name] = (await store.getFile(file.id)).bytes;
    }
    const archive = await runIsolated({kind:'zip',entries});
    download(archive.bytes, 'better-deepseek-results.zip', 'application/zip');
  }
  const open = () => {
    if (dialog.open || Array.from(document.querySelectorAll('dialog[open], [aria-modal="true"]')).some(node => node.getClientRects().length)) return;
    errorBox.textContent = ''; dialog.showModal(); refreshFiles().catch(report); refreshHistory().catch(report);
  };
  root.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    const tab = event.target.closest('[data-tab]')?.dataset.tab;
    if (!event.isTrusted) return;
    if (!initialized) return;
    if (tab) selectTab(tab);
    if (!action) return;
    errorBox.textContent = '';
    const run = async () => {
      if (action === 'open') open();
      if (action === 'close') dialog.close();
      if (action === 'start') {
        if (isGenerating()) throw new Error('Wait for the current DeepSeek response to finish');
        await engine.start(goal.value, [...selected], draftId);
      }
      if (action === 'stop') await engine.stop();
      if (action === 'resume') await engine.resume();
      if (action === 'retry') await engine.resume({ retry: true });
      if (action === 'fix') await engine.repair();
      if (action === 'approve') await engine.resume({ approve: true });
      if (action === 'new') { engine.task = null; selected.clear(); files = []; draftId = crypto.randomUUID(); goal.value = ''; root.querySelector('.bds-ws-preview').hidden = true; render(); renderFiles(); }
      if (action === 'import') { pickingFiles = true; root.querySelector('input[type="file"]').click(); }
      if (action === 'zip') await bundle();
      if (action === 'language') { language = language === 'ar' ? 'en' : 'ar'; translate(); await chrome.storage.local.set({ bds_workspace_locale: language }); }
    };
    run().catch(report);
  });
  root.querySelector('input[type="file"]').addEventListener('change', async event => {
    try {
      if (!event.isTrusted && !pickingFiles) return;
      for (const file of event.target.files) {
        if (!/\.(txt|md|csv|json|xlsx)$/i.test(file.name)) throw new Error('Supported inputs: TXT, MD, CSV, JSON, XLSX');
        if (file.size > 20 * 1024 * 1024) throw new Error('File exceeds 20 MB');
        safePath(file.name);
        // A file import is local only. Sharing is always an explicit checkbox.
        await store.putFile(fileTaskId(), file, { generated: false });
      }
      await refreshFiles(); errorBox.textContent = label().imported;
    } catch (error) { report(error); }
    finally { pickingFiles = false; event.target.value = ''; }
  });
  root.querySelector('input[type="file"]').addEventListener('cancel', () => { pickingFiles = false; });
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); dialog.close(); }
    if (event.key === 'Tab') {
      const nodes = Array.from(dialog.querySelectorAll('button:not(:disabled):not([tabindex="-1"]), textarea, input, pre[tabindex], a')).filter(node => node.getClientRects().length);
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
      if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
    }
    const tab = event.target.closest('[data-tab]');
    if (tab && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      event.preventDefault();
      const tabs = ['task','steps','files','log']; const delta = (event.key === 'ArrowRight' ? 1 : -1) * (language === 'ar' ? -1 : 1);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (tabs.indexOf(activeTab) + delta + 4) % 4;
      selectTab(tabs[next]); root.querySelector(`[data-tab="${activeTab}"]`).focus();
    }
  });
  window.addEventListener('bds:open-workspace', open);

  async function bindIfNewConversation(text = '') {
    const task = engine.task;
    if (!task || task.conversationId === conversation()) return;
    if (task.conversationId.startsWith('pending:') && task.steps.length === 0 && !conversation().startsWith('pending:') &&
      (text.includes(task.id) || Array.from(document.querySelectorAll('.ds-message')).some(node => role(node) === 'user' && node.textContent.includes(task.id)))) {
      binding ||= store.bindTask(task.id, conversation()).then(saved => { task.conversationId = saved.conversationId; }).finally(() => { binding = null; });
      await binding;
    } else if (!TERMINAL.has(task.status)) { engine.epoch++; engine.controller?.abort(); await engine.pause(label().changed); }
  }
  window.addEventListener('bds:urlChanged', () => { bindIfNewConversation().catch(report); });
  // A manual submission pauses automation before it can overwrite a user's input.
  document.addEventListener('keydown', event => {
    if (!event.isTrusted || sending || event.key !== 'Enter' || event.shiftKey || root.contains(event.target)) return;
    if (engine.task && !TERMINAL.has(engine.task.status) && (event.target.matches('textarea, [contenteditable]'))) {
      responseExpected = false;
      engine.epoch++; engine.controller?.abort(); engine.pause('Manual message: continue the task explicitly when ready').catch(report);
    }
  }, true);
  document.addEventListener('input', event => {
    if (!event.isTrusted || root.contains(event.target) || event.target.closest('#bds-root, #bds-quick-access') || !event.target.matches('textarea, [contenteditable]')) return;
    if (engine.task && !TERMINAL.has(engine.task.status)) {
      responseExpected = false; engine.epoch++; engine.controller?.abort(); engine.pause('Manual input: continue the task explicitly when ready').catch(report);
    }
  }, true);
  registerWorkspace({ userMessage(node, text) {
    if (!engine.task || baseline.has(node) || text.includes(engine.task.id)) return;
    if (!TERMINAL.has(engine.task.status)) {
      responseExpected = false; engine.epoch++; engine.controller?.abort(); engine.pause('Manual message: continue the task explicitly when ready').catch(report);
    }
  }, claimMessage(node, text, latest, generating) {
    if (claimed.has(node)) {
      queueReply(node, text, latest, generating);
      return true;
    }
    if (!engine.task && responseExpected && !baseline.has(node) && latest) {
      claimed.add(node); responseExpected = false;
      messageStates.set(node, {runId:'cancelled',id:crypto.randomUUID(),text,timer:null});
      return true;
    }
    if (engine.task && latest && baseline.has(node)) {
      const lastUser = Array.from(document.querySelectorAll('.ds-message')).filter(item => role(item) === 'user').at(-1);
      if (text.includes(engine.task.id) || lastUser?.textContent.includes(engine.task.id)) return true;
    }
    if (!engine.task || (TERMINAL.has(engine.task.status) && !responseExpected) || baseline.has(node) || !latest) return false;
    responseExpected = false;
    claimed.add(node);
    if (/BDS:/.test(text)) {
      node.setAttribute('data-bds-workspace-managed', '');
      const wrapper = document.createElement('div'); wrapper.className = 'bds-host-wrapper';
      const note = document.createElement('button'); note.type = 'button'; note.className = 'bds-ws-inline'; note.textContent = label().open;
      const runId = engine.task.id;
      note.addEventListener('click', event => { if (event.isTrusted) selectPastTask(runId).catch(report); });
      wrapper.append(note); node.append(wrapper); notes.set(node, {button:note,runId,final:/<BDS:DONE\b/.test(text)});
    }
    queueReply(node, text, latest, generating);
    return true;
  } });
  function queueReply(node, text, latest, generating) {
    if (!engine.task) return;
    let state = messageStates.get(node);
    if (!state) { state = { id: crypto.randomUUID(), runId: engine.task.id, text: '', timer: null }; messageStates.set(node, state); }
    if (state.runId !== engine.task?.id) return;
    if (state.text === text && state.timer && !generating) return;
    clearTimeout(state.timer);
    state.text = text;
    if (!latest || generating || node.querySelector('.ds-cursor, ._streaming') || node.classList.contains('_streaming')) return;
    // Allow the final DOM patch to settle before accepting closed protocol tags.
    const deliver = async () => {
      state.timer = null;
      if (state.runId !== engine.task?.id || isGenerating() || !node.isConnected) return;
      if (engine.busy) { state.timer = setTimeout(deliver, 200); return; }
      try { await bindIfNewConversation(state.text); await engine.ingest(state.text, state.id); }
      catch (error) { report(error); }
    };
    state.timer = setTimeout(deliver, 500);
  }
  try {
    const saved = await chrome.storage.local.get('bds_workspace_locale');
    if (['ar','en'].includes(saved.bds_workspace_locale)) language = saved.bds_workspace_locale;
    await engine.restore();
  } catch (error) { report(error); }
  initialized = true;
  translate(); selectTab('task'); refreshFiles().catch(report);
}
