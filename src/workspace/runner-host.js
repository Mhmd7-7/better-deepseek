// This page has an opaque origin, no extension privileges, and connect-src none.
let worker = null;
let activeId = null;
function stop() { worker?.terminate(); worker = null; }
window.addEventListener('pagehide', stop);
window.addEventListener('message', event => {
  if (!event.isTrusted || event.source !== parent || event.data?.channel !== 'BDS_TASK_SANDBOX') return;
  const { id, action, source, job } = event.data;
  if (action === 'cancel') { if (id === activeId) stop(); return; }
  if (activeId || typeof id !== 'string' || typeof source !== 'string' || source.length > 5 * 1024 * 1024) return;
  activeId = id;
  const reply = (error, result) => { stop(); parent.postMessage({ channel: 'BDS_TASK_RESULT', id, error, result }, '*'); };
  try {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = e => {
      if (e.data?.id !== id || e.data?.type !== 'task-result') return;
      reply(e.data.error, e.data.result);
    };
    worker.onerror = event => reply(event.message || 'Worker execution failed');
    worker.postMessage({ id, job });
  } catch (error) { reply(error.message); }
});
