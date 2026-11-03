import { Readability } from '@mozilla/readability';
import Turndown from 'turndown';
import { parseSearchResults, formatSearchResults } from '../content/files/search-reader.js';
import { fetchWorkspacePage } from './network.js';
import { runIsolated } from './runner-client.js';
import { extractMcpResultText } from '../lib/mcp-result.js';

export function safePath(name) {
  const value = String(name || '').replace(/\\/g, '/');
  if (!value || value.length > 200 || value.startsWith('/') || value.split('/').some(p => !p || p === '.' || p === '..' || p === '.git' || /^ |[. ]$/.test(p) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(p)) || /[<>:"|?*\u0000-\u001f\u202a-\u202e\u2066-\u2069]/.test(value)) throw new Error('Use a relative filename without reserved characters or parent paths');
  return value;
}

export function createTools({ store, runner = runIsolated, fetchPage = fetchWorkspacePage, mcpServers = () => [] }) {
  return async function execute(call, { task, signal }) {
    const args = call.args;
    const check = () => { if (signal.aborted) throw new DOMException('Stopped', 'AbortError'); };
    const put = async (name, bytes, type = 'text/plain') => {
      check();
      const file = await store.putFile(task.id, new File([bytes], safePath(name), { type }), { generated: true, callId: call.id });
      check();
      return { file: { id: file.id, name: file.name, size: file.size, type: file.type } };
    };
    check();
    if (call.tool === 'files.list') return { files: (await store.listFiles(task.id)).filter(f => f.generated || task.fileIds.includes(f.id)).map(({ id, name, size, type }) => ({ id, name, size, type })) };
    if (call.tool === 'files.read') {
      const files = await store.listFiles(task.id);
      const allowed = files.find(f => (f.id === args.fileId || f.name === args.fileId) && (f.generated || task.fileIds.includes(f.id)));
      if (!allowed) throw new Error('File is not selected for this task');
      const file = await store.getFile(allowed.id);
      const preview = await runner({ kind: 'import', name: file.name, bytes: file.bytes }, { signal });
      return { name: file.name, ...preview };
    }
    if (call.tool === 'files.write') return put(args.name, args.content);
    if (call.tool === 'code.run') {
      const files = {};
      if (args.fileIds !== undefined && (!Array.isArray(args.fileIds) || !args.fileIds.every(id => typeof id === 'string'))) throw new Error('fileIds must be an array of selected file IDs');
      for (const id of args.fileIds || []) {
        if (!task.fileIds.includes(id)) throw new Error('Code can only read selected input files');
        const file = await store.getFile(id); check();
        files[id] = { name: file.name, bytes: file.bytes };
      }
      return runner({ kind: 'code', code: args.code, files }, { signal });
    }
    if (call.tool === 'document.create') {
      if (args.name && !args.name.toLowerCase().endsWith(`.${args.format}`)) throw new Error('Document filename extension must match its format');
      const result = await runner({ ...args, kind: 'document' }, { signal });
      return put(safePath(args.name || `document.${args.format}`), result.bytes, result.type);
    }
    if (call.tool === 'web.search') {
      // Search content remains untrusted data; only source URLs are cited.
      const providers = [
        ['https://lite.duckduckgo.com/lite/?q=', 'DuckDuckGo Lite'],
        ['https://www.bing.com/search?q=', 'Bing'],
      ];
      let lastError;
      for (const [base, provider] of providers) {
        check();
        try {
          const response = await fetchPage(base + encodeURIComponent(args.query), signal);
          const results = parseSearchResults(response.html, provider).slice(0,8);
          if (!results.length) throw new Error('Search provider returned no usable results or a verification page');
          return { text: formatSearchResults(args.query, results, provider).slice(0,30000), sources: results.map(r => ({ title: r.title, url: r.url })) };
        } catch (error) { check(); lastError = error; }
      }
      throw lastError;
    }
    if (call.tool === 'web.read') {
      const response = await fetchPage(args.url, signal);
      check();
      const document = new DOMParser().parseFromString(response.html, 'text/html');
      const article = new Readability(document).parse();
      if (!article?.content) throw new Error('Page content could not be extracted');
      const markdown = new Turndown({ headingStyle: 'atx' }).turndown(article.content);
      return { title: article.title, url: response.url || args.url, text: markdown.slice(0,30000), truncated: markdown.length > 30000, sources: [{ title: article.title, url: response.url || args.url }] };
    }
    if (call.tool === 'mcp.call') {
      const server = mcpServers().find(server => (server.url || server.serverUrl) === args.serverUrl && server.enabled !== false);
      if (!server || !call.approved) throw new Error('Choose a configured MCP server and approve this external action first');
      const response = await chrome.runtime.sendMessage({ type: 'bds-mcp-call', serverUrl: args.serverUrl, toolName: args.toolName, args: args.args || {}, apiKey: server.apiKey || '' });
      check();
      if (!response?.ok) throw new Error(response?.error || 'MCP operation failed');
      if (response.result?.isError) throw new Error(extractMcpResultText(response.result).slice(0,1000) || 'MCP tool returned an error');
      return { text: extractMcpResultText(response.result || response).slice(0,30000) };
    }
    throw new Error('Unknown tool');
  };
}
