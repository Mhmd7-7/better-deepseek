export const FILE_LIMIT = 20 * 1024 * 1024;
export const TASK_LIMIT = 100 * 1024 * 1024;
export const TERMINAL = new Set(['complete', 'cancelled']);

export function toBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return btoa(binary);
}
export function fromBase64(value) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }

export class WorkspaceStore {
  async request(action, data = {}) {
    const result = await chrome.runtime.sendMessage({ type: 'BDS_WORKSPACE_STORE', action, ...data });
    if (!result?.ok) throw new Error(result?.error || 'Local workspace storage is unavailable');
    return result.value;
  }
  listTasks() { return this.request('listTasks'); }
  createTask(task) { return this.request('createTask', { task }); }
  saveTask(task) { return this.request('saveTask', { task }); }
  claimTask(id) { return this.request('claimTask', { id }); }
  bindTask(id, conversationId) { return this.request('bindTask', { id, conversationId }); }
  listFiles(taskId) { return this.request('listFiles', { taskId }); }
  async putFile(taskId, file, extra = {}) {
    if (file.size > FILE_LIMIT) throw new Error('File exceeds 20 MB');
    return this.request('putFile', { file: {
      id: crypto.randomUUID(), taskId, name: file.name, type: file.type || 'application/octet-stream',
      data: toBase64(new Uint8Array(await file.arrayBuffer())), ...extra,
    } });
  }
  async getFile(id) {
    const value = await this.request('getFile', { id });
    return { ...value, bytes: fromBase64(value.data) };
  }
  removeFile(id) { return this.request('removeFile', { id }); }
}
