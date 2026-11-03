# xangi-voice-input

English | [日本語](README.ja.md)

Enter Japanese text into Xangi's chat composer by speaking, without opening the keyboard.
Recognized text is added to your draft and is never sent automatically.

> **Requirements: Google Chrome and HTTPS through Tailscale.**
>
> This extension uses Chrome's speech recognition through the Web Speech API.
> From a phone or another computer, open the HTTPS URL provided by Tailscale Serve in Chrome.
> Connecting to Tailscale and opening an IP address over `http://` is not enough to enable voice input.

**Under development:** Xangi must support `ui.composer` contributions and advertise `draft.snapshot`. The extension does not patch or rebuild Xangi. Older hosts can only display the information page.

The generic host interface is described in [Composer contribution protocol](docs/composer-protocol.md).

## Supported environment

| Component | Requirement |
| --- | --- |
| Browser | Google Chrome with microphone permission. Other browsers are outside the supported configuration. |
| Remote access | Server and client connected to the same Tailscale network (tailnet), using a Tailscale Serve HTTPS URL. |
| Recognition | Chrome's Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`). No separate recognition server is needed. |
| Xangi | A version supporting `ui.composer` and `draft.snapshot`. The extension alone does not add composer support to Xangi. |
| Language | Japanese (`ja-JP`). English documentation does not change the recognition language or translate the interface. |

Availability depends on OS, device, and browser settings, even in Chrome.
The Chrome name alone does not guarantee support, including on iPhone and iPad.
Check microphone permissions and actual recognition on the device you intend to use.

## Getting started

1. In Xangi's Extensions page, add [this public repository](https://github.com/karaage0703/xangi-voice-input).
2. Follow the setup conversation and review and approve the necessary settings.
3. For remote access, connect to Tailscale and open the provided **HTTPS URL in Chrome**.
4. Press the microphone in the chat composer and allow Chrome to use your microphone.
5. Speak Japanese, review your draft, and send it yourself.

Installing Tailscale, signing in, and enabling HTTPS for the first time may require your interaction.
Adding the extension does not automatically grant OS or browser permissions.
Testing through `localhost` on the same device does not require Tailscale HTTPS setup.

## Usage and privacy

Press the microphone to start. Recognition stops at the end of an utterance; press again to stop early.
Interim text appears only as status text. Final text is applied to the draft.
Updated recognition results replace the current utterance instead of repeatedly appending it.

Typing, switching conversations or panes, or moving the page to the background ends recognition.
Sending is disabled during recognition. Normal keyboard input remains available.
Reload the chat or return focus to its window after installing, starting, or stopping an extension. Xangi does not poll the extension catalog in the background.

Audio may be sent to Chrome's speech recognition service. Offline recognition is not guaranteed.
This extension and the Xangi server do not receive audio or provide an audio upload API.

## Installation

Xangi's setup agent follows [XANGI_SETUP.md](XANGI_SETUP.md), inspects the environment,
and proposes Tailscale HTTPS setup when needed. You review the settings, sign in, approve HTTPS activation,
and grant microphone permission as needed. Enabling the extension does not automatically grant these permissions.

Manual installation requires Node.js 22 or later, a POSIX host (Linux/macOS), and a compatible Xangi version.
No additional npm packages are required.

```sh
git clone https://github.com/karaage0703/xangi-voice-input.git
cd xangi-voice-input
chmod +x scripts/xangi-extension
xangi extension link "$PWD/xangi-extension.json"
# Target the same running Xangi instance (XANGI_TOOL_SERVER must be set).
xangi extension start xangi-voice-input
```

Use Xangi's extension management page to stop or start the extension. Linking enables automatic startup.
The service listens only on `127.0.0.1` and requires Xangi's management Bearer token for every request.
The token is never passed to the browser.

## HTTPS through Tailscale

The supported remote configuration uses Tailscale Serve HTTPS within the same tailnet.
For example, when Xangi listens on `127.0.0.1:18888`, an administrator can configure:

```sh
tailscale serve --bg --https=18889 http://127.0.0.1:18888
```

Use the actual listening address and open the HTTPS URL printed by Tailscale.
Keep access within the tailnet; Funnel public exposure is unnecessary. Preserve existing Serve settings.
No self-signed certificates or private certificate authority are needed.

Guided setup detects the connected device's DNS name and existing Serve settings, then configures HTTPS after approval.
For manual setup, run this interactive command on the Xangi host with the actual upstream address:

```sh
npm run setup:https -- --target http://127.0.0.1:18888
```

Use `--check` to inspect without changes, or `--yes` to apply a previously approved setup.
The helper reuses a suitable HTTPS endpoint and avoids ports used by existing Serve listeners. It does not enable Funnel.
Tailscale installation and sign-in are separate steps. For Docker, run the helper on the host, not inside the container.
If HTTPS activation or administrator privileges are required, follow the instructions, approve the operation, and rerun it.
Normal extension startup does not change OS or Serve settings.

Voice input is disabled on insecure LAN HTTP connections; keyboard input remains available.
Localhost development and other valid HTTPS connections are not intentionally blocked, although Tailscale is the supported remote setup.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| No microphone button | Confirm Xangi supports `composer.input` and the extension is running and healthy. |
| HTTP warning | Open the Tailscale Serve `https://` URL. HTTP access to a Tailscale IP is insufficient. |
| Unsupported browser | Open in Google Chrome. Some devices do not expose the API even in Chrome. |
| Microphone permission error | Allow microphone access in Chrome's site settings and OS settings. |
| Recognition service connection error | Check network connectivity and restrictions on the browser's speech recognition service. |
| HTTPS URL does not open | Check client tailnet connectivity, Tailscale access permissions, and Serve settings. |

Normal keyboard input remains available when voice input cannot be used.

## Development and tests

`src/extension.mjs` serves the UI under Xangi's management.
`public/voice.js` controls the Web Speech API and sends text snapshots to Xangi.
No server-side recognition engine or API is required.

```sh
npm test
# First run npm ci in a Xangi checkout with composer.input support:
XANGI_CORE_PATH=/path/to/xangi XANGI_TEST_CHROMIUM=/path/to/chromium npm run test:browser
```

Browser tests use the actual ChatPane, management service, and iframe, with the recognition engine mocked.
They cover duplicate cumulative results, keyboard input, finalization on stop, stale results after conversation changes,
permission denial, backgrounding, extension removal, unsupported APIs, HTTP fallback, and a mobile viewport.
Verify real microphone recognition and OS behavior separately on actual devices.

Composer integration is for trusted extensions on the same origin.
The iframe is not a security boundary for isolating malicious extension code.
