# Live native “Read aloud” integration

## What was implemented

Live now uses **DeepSeek’s own per-response Read aloud control** after a reply’s
generation is verified complete. It does not generate, decode or synthesize
speech itself.

- `enhancements/deepseek-voice.js` — native-UI controller:
  - Live session/turn lifecycle and correlated generation tracking.
  - Opaque streaming-row binding by `data-virtual-list-item-key`, never by text
    or DOM position.
  - Completion gating through `bds:native-generation`: HTTP success + clean
    transport end, with the native toolbar as the final availability gate. A
    `[DONE]` marker is labelled explicit, while clean EOF/JSON is labelled
    transport. If the bridge reports nothing, a stable, enabled native control
    on the bound new row is accepted after the request started. Text
    inactivity alone is never completion.
  - One click per verified reply, scoped to that row’s action toolbar.
  - Microphone is paused before activation. A page-context observer (installed
    by `injected.js`) reports the site's own `<audio>/<video>` or Web Audio
    BufferSource start/end after each activation, so Live automatically leaves
    “Speaking…” and resumes listening when the reply ends.
  - If no native playback event is observable, a visible **Resume listening**
    control in the Live header hands the microphone back without guessing.
  - DeepSeek toasts such as “Read aloud isn’t supported for this language yet”
    are detected while playback is being requested. The microphone is released
    immediately, the status names the reason, and that reply language is not
    retried for the rest of the page session. Native quota/rate-limit toasts are
    handled the same way. No fallback voice is used.
  - Explicit **Play reply / enable site audio**, **Stop reply**, and
    **Audio stopped — resume listening** controls.
- `enhancements/live-audio.js` — Live engine integration:
  - Starts the controller when Live starts and ends it on stop/navigation.
  - Arms a turn before `sendPrompt`, including in a brand-new chat whose URL
    has no `/chat/s/<id>` yet; the captured request session is adopted.
  - Disables the bundle’s text-inactivity response watcher for Live.
  - Pauses VAD/recognition and blocks deferred prompt submission while native
    audio is active.
- `enhancements/voice-panel.js` / `voice-panel.css` — inspection-only status,
  “Check native Read aloud — no playback”, and Live-only auto-read setting.
- `injected.js` — correlated generation bridge
  `bds:native-generation` and Live arm `bds:native-live-turn`; private TTS ticket
  transport removed.
- `content.js` — inert legacy automatic reader and removal of the private TTS
  WebSocket/PCM reader.

## Native-path evidence

- The only activation is `element.click()` on
  `[role="button"][aria-label="Read aloud"]` inside the bound assistant row,
  outside `.ds-assistant-message-main-content`.
- Source scan: no `speechSynthesis`, `SpeechSynthesisUtterance`, Android TTS,
  `/chat/tts/`, ticket, WebSocket or `AudioContext` in the shipped voice path.
- Isolated Chromium DOM tests (synthetic, not a DeepSeek runtime capture) prove:
  19/19 scenarios pass, including Arabic/English replies, sibling toolbar,
  virtualized row reinsertion, delayed/disabled/missing controls, stop,
  navigation, regeneration, autoplay/unknown playback, and teardown.

## Honest limitations

- The user-supplied HTML snapshot was not present in the workspace or DSH
  attachment directories, and the running Chrome had no remote-debugging
  endpoint. Therefore the real site’s toolbar structure, row-key semantics and
  native media events were **not** verified at runtime.
- Playback end is taken from the site's own media/Web Audio lifecycle when
  observable. A loop/`AudioWorklet` player or a player in another frame remains
  unobservable; then Live keeps “Speaking…” with a **Resume listening** control
  rather than claiming a verified end.
- Clicking Read aloud again is **not** used to stop playback: its toggle
  behavior was not verified. “Stop reply” only pauses observable media; when
  unobservable it asks the user to stop audio in DeepSeek.
- A trusted manual Read aloud click during tracked playback is treated as
  ambiguous; Live stays paused until explicit confirmation.
- DeepSeek’s native Read aloud currently does **not** support Arabic replies
  (“Read aloud isn’t supported for this language yet”). Per the native-only
  requirement, the extension cannot voice Arabic; it now resumes listening and
  stops retrying instead of remaining stuck in Speaking.
- If the native toolbar never becomes available/enabled, automatic reading fails
  closed with a visible Live status/toast rather than guessing.
- New-chat adoption and transport completion were tested offline; the real
  DeepSeek UI/media transitions could not be observed in this environment.
- The user must enable site audio if browser autoplay policy blocks it; a
  synthetic click does not bypass that policy.

## Enable and test

1. Reload the extension (`chrome://extensions` / `edge://extensions`) and refresh
   the DeepSeek tab.
2. Open Voice settings, confirm **Read replies with DeepSeek in Live** is on
   (default for a new profile), and use **Check native Read aloud — no playback**
   to inspect the current Live reply.
3. Start Live, speak once, and let the reply complete. The page’s own Read
   aloud control should activate once.
4. To stop, use Live mute/stop or **Stop reply**. When status asks for
   confirmation, stop audio in DeepSeek and press
   **Audio stopped — resume listening**.

## Automated checks

```powershell
node --test --test-isolation=none tests/deepseek-voice.test.cjs tests/native-generation.test.cjs tests/native-playback.test.cjs tests/native-voice-bundle.test.cjs tests/live-audio.test.cjs tests/voice-panel.test.cjs tests/voice-panel-runtime.test.cjs tests/speech-languages.test.cjs tests/quick-access-search.test.cjs
# Isolated synthetic DOM/media checks only; no site or account:
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-extensions --remote-debugging-address=127.0.0.1 --remote-debugging-port=9239 --user-data-dir="tests\.native-ui-profile" about:blank
node tests/native-read-aloud-browser.cjs
node --check enhancements/deepseek-voice.jsnode --check enhancements/live-audio.js
node --check enhancements/voice-panel.js
```

The browser test uses a synthetic DOM/media fixture. No account, microphone,
network request or real audio was used; audio was not heard or verified.
