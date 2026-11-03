let workerSource;
export async function runIsolated(job, { signal, timeoutMs = 30000 } = {}) {
  if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
  workerSource ||= fetch(chrome.runtime.getURL('task-worker.js')).then(r => {
    if (!r.ok) throw new Error('Could not load packaged task worker');
    return r.text();
  }).catch(error => { workerSource = null; throw error; });
  const source = await workerSource;
  if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.title = 'Isolated task worker';
    frame.sandbox = 'allow-scripts';
    frame.src = chrome.runtime.getURL('task-sandbox.html');
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      frame.contentWindow?.postMessage({ channel: 'BDS_TASK_SANDBOX', id, action: 'cancel' }, '*');
      window.removeEventListener('message', receive);
      signal?.removeEventListener('abort', abort);
      clearTimeout(timer);
      frame.remove();
      if (error) reject(error); else resolve(value);
    };
    const abort = () => finish(new DOMException('Stopped', 'AbortError'));
    const receive = event => {
      if (!event.isTrusted || event.source !== frame.contentWindow || event.data?.channel !== 'BDS_TASK_RESULT' || event.data.id !== id) return;
      if (event.data.error) finish(new Error(event.data.error));
      else finish(null, event.data.result);
    };
    const timer = setTimeout(() => finish(new Error('Execution exceeded 30 seconds')), timeoutMs);
    window.addEventListener('message', receive);
    signal?.addEventListener('abort', abort, { once: true });
    frame.addEventListener('load', () => {
      if (!settled) frame.contentWindow.postMessage({ channel: 'BDS_TASK_SANDBOX', id, source, job }, '*');
    }, { once: true });
    frame.addEventListener('error', () => finish(new Error('Could not load the isolated runner')), { once: true });
    document.body.append(frame);
  });
}
