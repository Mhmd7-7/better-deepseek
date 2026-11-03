const inflight = new Map();
const stopped = new Map();
export async function handleWorkspaceFetch(message, sender) {
  if (!sender.tab?.id || !sender.url?.startsWith('https://chat.deepseek.com/')) throw new Error('DeepSeek tab required');
  const key = `${sender.tab.id}:${message.requestId}`;
  if (message.type === 'BDS_WORKSPACE_CANCEL') {
    inflight.get(key)?.abort();
    stopped.set(key, Date.now());
    setTimeout(() => stopped.delete(key), 60000);
    return { ok: true };
  }
  if (stopped.has(key)) throw new Error('Request cancelled');
  const url = new URL(message.url);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid web URL');
  const controller = new AbortController();
  inflight.set(key, controller);
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit', redirect: 'follow' });
    if (!response.ok) return { ok: false, status: response.status, error: `HTTP ${response.status}` };
    const declared = Number(response.headers.get('content-length'));
    if (declared > 5 * 1024 * 1024) throw new Error('Web page exceeds 5 MB');
    const reader = response.body.getReader();
    const chunks = []; let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 5 * 1024 * 1024) { await reader.cancel(); throw new Error('Web page exceeds 5 MB'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return { ok: true, html: new TextDecoder().decode(bytes), url: response.url };
  } finally { clearTimeout(timer); inflight.delete(key); }
}

export async function fetchWorkspacePage(url, signal, message = chrome.runtime.sendMessage.bind(chrome.runtime)) {
  if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
  const requestId = crypto.randomUUID();
  const cancel = () => { message({ type: 'BDS_WORKSPACE_CANCEL', requestId }).catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
      const result = await message({ type: 'BDS_WORKSPACE_FETCH', requestId, url });
      if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
      if (result?.ok) return result;
      if (attempt === 2 || (result?.status && result.status < 500 && ![408,429].includes(result.status))) throw new Error(result?.error || 'Network request failed');
      await new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new DOMException('Stopped', 'AbortError')); };
        const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, 1000 * 2 ** attempt);
        signal?.addEventListener('abort', abort, { once: true });
      });
    }
  } finally { signal?.removeEventListener('abort', cancel); }
}
