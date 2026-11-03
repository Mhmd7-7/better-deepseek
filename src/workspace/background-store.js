import { FILE_LIMIT, TASK_LIMIT, TERMINAL, fromBase64, toBase64 } from './storage.js';

let opened;
function database() {
  return opened ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('bds-workspace-v1', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('tasks', { keyPath: 'id' });
      request.result.createObjectStore('files', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { opened = null; reject(request.error); };
  });
}
async function transaction(storeName, write, operate) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, write ? 'readwrite' : 'readonly');
    let value;
    const fail = error => { reject(error); tx.abort(); };
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Storage operation cancelled'));
    try { operate(tx.objectStore(storeName), result => { value = result; }, fail); } catch (e) { fail(e); }
  });
}
const meta = file => { const { blob, ...info } = file; return info; };

export async function handleWorkspaceStore(message, sender) {
  if (!sender.tab?.id || !sender.url?.startsWith('https://chat.deepseek.com/')) throw new Error('Workspace access requires a DeepSeek tab');
  const tabId = sender.tab.id;
  switch (message.action) {
    case 'listTasks': return transaction('tasks', false, (store, done) => {
      store.getAll().onsuccess = e => done(e.target.result.map(task => ({ ...task, owned: task.ownerTabId === tabId })));
    });
    case 'createTask': return transaction('tasks', true, (store, done, fail) => {
      const task = message.task;
      if (!task?.id || !task.conversationId || typeof task.goal !== 'string' || task.goal.length > 12000) return fail(new Error('Invalid task'));
      store.getAll().onsuccess = event => {
        if (event.target.result.some(t => t.conversationId === task.conversationId && !TERMINAL.has(t.status))) return fail(new Error('This conversation already has an unfinished task'));
        const saved = { ...task, ownerTabId: tabId };
        store.add(saved);
        done(saved);
      };
    });
    case 'claimTask': {
      const prior = await transaction('tasks', false, (store, done) => { store.get(message.id).onsuccess = e => done(e.target.result); });
      if (!prior) throw new Error('Task not found');
      if (prior.ownerTabId !== tabId) {
        const tab = await chrome.tabs.get(prior.ownerTabId).catch(() => null);
        if (tab) throw new Error('Open or stop this task in its original tab first');
      }
      return transaction('tasks', true, (store, done, fail) => {
      store.get(message.id).onsuccess = async event => {
        const task = event.target.result;
        if (!task) return fail(new Error('Task not found'));
        if (task.ownerTabId !== prior.ownerTabId) return fail(new Error('Task was claimed by another tab'));
        task.ownerTabId = tabId;
        store.put(task);
        done(task);
      };
      });
    }
    case 'bindTask': return transaction('tasks', true, (store, done, fail) => {
      store.getAll().onsuccess = event => {
        const tasks = event.target.result;
        const task = tasks.find(t => t.id === message.id);
        if (!task || task.ownerTabId !== tabId || !task.conversationId.startsWith('pending:') || !/^\/[^?#]{1,200}$/.test(message.conversationId)) return fail(new Error('Invalid conversation binding'));
        if (tasks.some(t => t.id !== task.id && t.conversationId === message.conversationId && !TERMINAL.has(t.status))) return fail(new Error('Conversation already has an active task'));
        task.conversationId = message.conversationId;
        store.put(task); done(task);
      };
    });
    case 'saveTask': return transaction('tasks', true, (store, done, fail) => {
      store.get(message.task?.id).onsuccess = event => {
        const old = event.target.result;
        if (!old || old.ownerTabId !== tabId) return fail(new Error('Task belongs to another tab'));
        if (message.task.conversationId !== old.conversationId) return fail(new Error('Task conversation cannot change'));
        const saved = { ...message.task, ownerTabId: tabId };
        store.put(saved); done(saved);
      };
    });
    case 'listFiles': return transaction('files', false, (store, done) => {
      store.getAll().onsuccess = e => done(e.target.result.filter(f => f.taskId === message.taskId).map(meta));
    });
    case 'putFile': {
      const incoming = message.file;
      if (!incoming?.taskId || !incoming.id || typeof incoming.data !== 'string' || incoming.data.length > Math.ceil(FILE_LIMIT / 3) * 4 + 4) throw new Error('Invalid file or file exceeds 20 MB');
      const bytes = fromBase64(incoming.data);
      if (bytes.length > FILE_LIMIT) throw new Error('File exceeds 20 MB');
      const { data, ...info } = incoming;
      const file = { ...info, size: bytes.length, createdAt: Date.now(), blob: new Blob([bytes], { type: info.type }) };
      return transaction('files', true, (store, done, fail) => {
        store.getAll().onsuccess = e => {
          const files = e.target.result;
          const existing = file.generated && file.callId && files.find(f => f.taskId === file.taskId && f.callId === file.callId);
          if (existing) { done(meta(existing)); return; }
          const total = files.filter(f => f.taskId === file.taskId && f.id !== file.id).reduce((sum, f) => sum + f.size, 0);
          if (total + file.size > TASK_LIMIT) return fail(new Error('Task files exceed 100 MB'));
          store.put(file); done(meta(file));
        };
      });
    }
    case 'getFile': {
      const file = await transaction('files', false, (store, done) => { store.get(message.id).onsuccess = e => done(e.target.result); });
      if (!file) throw new Error('File not found');
      return { ...meta(file), data: toBase64(new Uint8Array(await file.blob.arrayBuffer())) };
    }
    case 'removeFile': return transaction('files', true, (store, done) => { store.delete(message.id); done(true); });
    default: throw new Error('Unknown workspace storage operation');
  }
}
