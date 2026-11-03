import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync, cpSync, mkdirSync, watch as watchDirectory } from 'node:fs';

const root = import.meta.dirname;
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json')));
const outDir = resolve(root, 'dist-chrome');
const watch = process.argv.includes('--watch');
const entries = [
  ['src/content/index.js', 'content', true],
  ['src/background/index.js', 'background'],
  ['src/injected/index.js', 'injected'],
  ['src/sandbox/index.js', 'sandbox'],
  ['src/workspace/runner-host.js', 'task-sandbox'],
  ['src/workspace/runner-worker.js', 'task-worker'],
];
async function buildExtension() {
for (const [entry, name, first] of entries) {
  await build({
    configFile: false,
    plugins: first ? [svelte()] : [],
    resolve: { alias: { 'bds-platform-globals': resolve(root, 'src/platform/globals-chrome.js') } },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.BDS_TARGET': '"chrome"', __BDS_VERSION__: JSON.stringify(pkg.version) },
    build: {
      outDir, emptyOutDir: !!first, minify: true, sourcemap: false,
      cssCodeSplit: false,
      rollupOptions: { input: resolve(root, entry), treeshake: false,
        output: { format: 'iife', inlineDynamicImports: true, entryFileNames: `${name}.js`, assetFileNames: `${name}.[ext]` } },
    },
  });
}
cpSync(resolve(root, 'static'), resolve(outDir, 'static'), { recursive: true });
for (const name of ['sandbox.html', 'task-sandbox.html']) cpSync(resolve(root, 'static', name), resolve(outDir, name));
cpSync(resolve(root, 'enhancements'), resolve(outDir, 'enhancements'), { recursive: true });
const manifest = JSON.parse(readFileSync(resolve(root, 'static/manifest.json')));
manifest.version = pkg.version;
writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
// Keep the repository root loadable as an unpacked extension, as before.
for (const name of ['content.js', 'content.css', 'background.js', 'injected.js', 'sandbox.js', 'sandbox.html', 'task-sandbox.js', 'task-worker.js', 'task-sandbox.html', 'manifest.json']) {
  cpSync(resolve(outDir, name), resolve(root, name));
}
mkdirSync(resolve(root, 'artifacts'), { recursive: true });
console.log(`Chrome extension ${pkg.version} built in dist-chrome/ and refreshed at repository root.`);
}
await buildExtension();
if (watch) {
  let dirty = false, building = false, timer;
  async function rebuild() {
    if (building) return;
    building = true;
    while (dirty) {
      dirty = false;
      try { await buildExtension(); } catch (error) { console.error('Build failed:', error); }
    }
    building = false;
  }
  for (const directory of ['src', 'static', 'enhancements']) watchDirectory(resolve(root, directory), { recursive: true }, () => {
    dirty = true; clearTimeout(timer); timer = setTimeout(rebuild, 250);
  });
  console.log('Watching src/, static/ and enhancements/. Reload the extension after each build.');
}
