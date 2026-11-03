# Validation and release gates — 0.2.0 preview

## Current-instance results

- Production Chrome build: passed.
- Unit/integration tests: 2,069 passed across 128 files, no unhandled errors.
- Chromium fixture tests: 29 passed, including rebuilt bundle integration, selected-file CSV analysis, valid Office documents, project ZIP contents, cancellation, explicit restoration and conversation binding.
- Locale-key consistency: passed.
- Runtime ZIP packaging: verified 17 declared runtime assets byte-for-byte against the build.
- Real extension smoke: failed during setup under the system browser's extension-loading restriction; it is not counted among the passing browser tests.
- Signed-in DeepSeek and physical Android validation: not run.

## Reproducible local checks

```sh
npm ci
npm run build
npm run test:unit
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/lib/chromium/chromium npm run test:ui
npm run package:extension
```

The executable override is optional on machines with Playwright Chromium installed. `npm test` runs unit/integration and browser fixture tests. `npm run test:extension` is the separate real extension-loading gate; it is not silently skipped or counted as passed by `npm test`.

Browser fixtures exercise the rebuilt content bundle and native composer adapter, incremental conversation search, IndexedDB storage handlers, JavaScript workers, valid Office ZIP/XML outputs, selected-file CSV analysis, task cancellation, explicit restoration, and generated project ZIP contents. Chrome messaging and DeepSeek/search replies are simulated. None of these tests represents a signed-in interaction with DeepSeek's production service.

## Known environment blockers

- Installing the standard Playwright Chromium returned HTTP 403 `Domain forbidden` from `cdn.playwright.dev`.
- Adding that domain to the environment draft failed with `draft_not_editable`; the proposed network change was not saved or applied. Preserve existing network rules when adding this host in an editable environment. Follow redirects normally and diagnose any additional host denial separately.
- The system Chromium previously rejected unpacked extension loading through CDP with `Loading of unpacked extensions is disabled by the administrator`. The real extension smoke test could not observe `#bds-toggle` and failed during setup. No browser policies were changed or bypassed.

The requested additive network change is also provided as `environment-network-request.json`. It contains no secrets and is a proposal, not evidence of an applied policy.

## Required manual gates before a stable release

1. Install the ZIP unpacked on desktop Chrome/Edge. Confirm the original BDS drawer, quick access, and task workspace all load without console errors.
2. Sign into DeepSeek normally. Start a research task; confirm real search/source results return to the correct conversation and a DOCX can be opened with its citations.
3. Import a CSV without selecting its sharing checkbox. Confirm the task cannot read it; select it, then request full-file analysis and an XLSX. Check totals independently.
4. Generate a small multi-file project, download the ZIP, and verify file paths and contents. Cancel another task while code is running and confirm no later prompt is automatically submitted.
5. Reload during an unfinished task. Confirm explicit resume is required and completed writes are not duplicated. Change conversations and confirm automation pauses.
6. On an actual Android browser that supports unpacked Chromium extensions, repeat the task/file/download/cancellation checks, including the native file picker, small-screen layout and keyboard behavior where available. Chrome for Android itself does not support extensions.
7. If MCP is used, configure a test server. Confirm each external action requires a real user approval and a cancelled/unknown external outcome is not automatically retried.

An absent account/device or failed gate remains outstanding; a responsive viewport screenshot does not count as a physical Android validation.
