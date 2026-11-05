# BDS Live audio regression checks

The packaged extension has no build step. `enhancements/speech-languages.js`, then `enhancements/live-audio.js` and `enhancements/voice-panel.js` load **before** `content.js` in the manifest; the bundle installs the helper on the Live engine immediately before creating its singleton. `enhancements/deepseek-voice.js` loads right after `content.js` and is the only speech path: it resolves the saved reply and streams DeepSeek's PCM audio. The page bundle's own auto-reader is disabled in `content.js`. There is no local service, no browser voice and no background audio transport.

## Automated checks

Requires Node.js 22 or later:

```powershell
node --test --test-isolation=none tests/deepseek-voice.test.cjs tests/live-audio.test.cjs tests/quick-access-search.test.cjs tests/speech-languages.test.cjs
node --check enhancements/live-audio.js
node --check enhancements/voice-panel.js
node --check content.js
```

`--test-isolation=none` avoids the subprocess pipe restriction of the Windows DSH sandbox. Tests run the **actual packaged engine, VAD and response watcher** in a VM with fake browser audio APIs and a deterministic clock. No microphone, network, credentials, or external test packages are used.

Coverage includes late microphone permission and AudioContext completion after close, close/reopen isolation, actual track muting (including permission pending), preserved barge-in text, recognition rollover, bounded retries, fatal permissions, delayed send cancellation, Arabic/CJK streaming boundaries, response-watch timeout, reused analyser buffers, live language changes driven by stored settings, settings-listener disposal, microphone pausing around native speech, and the absence of any browser speech path. Manifest load order and UI disposal anchors are also checked. The UI anchor assertions are static checks, not a browser rendering test.

## Activate and manually verify

1. Reload **Better DeepSeek** from `chrome://extensions` (or `edge://extensions`).
2. Refresh the `https://chat.deepseek.com` tab so it loads the updated content scripts.
3. In the BDS voice panel choose the language you actually speak, e.g. **العربية (SA)**. There is no browser-voice picker: the language only guides recognition. Existing silence-timeout settings are retained (600–2500 ms); the fallback for a missing setting is 900 ms.
4. Open Live, allow microphone access, and say one short sentence. Wait silently and verify it sends **once**. Live no longer speaks while the answer streams; when the reply completes, DeepSeek's voice reads it and the microphone pauses until the audio ends.
5. To verify the voice: open the voice panel and press **Test DeepSeek voice on the last reply** inside a saved chat (`/chat/s/…`). A clear stage error (no conversation, no saved reply, refused ticket, quota, rate limit, no audio) means the extension is working; there is no browser fallback.
6. Interrupt while the assistant is still generating (before its reply completes). Verify your interruption text is retained and the old response stops. While DeepSeek's audio is playing the microphone is paused, so the way to stop it is mute or close Live; the audio must stop immediately.
7. Mute while speaking and while the assistant is responding. Speech during mute must not send later; chunks skipped while muted must not replay on unmute. The Live VAD track is disabled and recognition is aborted while muted. The browser may still show a microphone indicator because the disabled VAD track remains allocated until Live closes.
8. Close Live while the initial permission dialog is open; then allow permission. There must be no late microphone capture or revived session. Reopen Live and confirm a fresh conversation works.
9. Deny microphone permission and verify Live reports the error rather than repeatedly requesting/restarting recognition. Restore site permission before reopening.
10. Close Live during a response. Verify audio stops and the Live microphone is released. Closing Live does not intentionally cancel the already-sent text generation in the chat; the explicit interruption control does.

Actual recognition latency, pronunciation/voice availability, echo cancellation and server response time require testing in the user's browser and audio environment. Automated tests do not establish measured real-world latency improvements or change the browser speech provider/model speed.
