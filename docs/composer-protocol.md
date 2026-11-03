# Composer contribution protocol

Installed, running, healthy extensions declaring `ui.composer` can contribute text to the Web Chat draft.
This interface also supports non-voice extensions such as canned replies and asynchronous text generators.
This repository implements an optional voice-input consumer. Install it by repository URL; the host does not need a voice-specific catalog entry.
It uses Google Chrome's speech recognition for Japanese input; remote use assumes Tailscale Serve HTTPS.
Installation, microphone permissions, and optional HTTPS setup are described in the extension repository.
Xangi itself does not run a speech recognition engine or receive audio.

## Protocol

Xangi loads `/api/extensions/<id>/service<ui.composer.path>` in a same-origin iframe.
Only declared `ui.composer.permissions` are granted (currently `microphone` is supported).
The ordinary extension UI at `ui.path` is unchanged.
Every message uses `schemaVersion: 1`. Both sides must validate origin and source window.
Extensions announce `xangi.composer.ready`. Xangi responds with `xangi.composer.configure`,
containing a `contextId`, `disabled` flag and `capabilities: ["draft.insert", "draft.snapshot"]`. Extensions must cancel work when the context changes or they are disabled.

Extension messages include the current `contextId`:

| Message                       | Additional fields               | Purpose                                                                  |
| ----------------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| `xangi.composer.availability` | `message`                       | Explain availability, including HTTP or browser limitations.             |
| `xangi.composer.insert`       | `requestId`, `text`              | Insert text once, without starting a long-running operation. |
| `xangi.composer.begin`        | `requestId`                     | Start one input operation; sending is disabled until it ends.            |
| `xangi.composer.update`       | `requestId`, `revision`, `text` | Supply the entire recognized utterance, replacing its previous snapshot. |
| `xangi.composer.status`       | `requestId`, `message`          | Show interim progress without changing the draft.                        |
| `xangi.composer.end`          | `requestId`, optional `error`   | End the operation and restore normal sending.                            |

Revisions must be increasing safe integers. Request IDs are nonempty strings of at most 100 characters;
Insertion text and text snapshots are nonblank strings of at most 100,000 characters. Status messages are limited to 1,000 characters.
An insert changes the context ID, so duplicate messages with its old context are ignored.
Insert operations are rejected while another operation is active.
Only one extension operation is active at a time. Context changes invalidate late results.
Typing, switching conversations or inactive panes, hiding the page, or removing an extension cancels its operation.
The first snapshot is appended to the draft with a newline if needed; subsequent snapshots replace the earlier suffix.
If that suffix has been manually edited, subsequent updates do not overwrite the draft.
Extensions do not receive a send capability, and results do not automatically focus the textarea.

The iframe is intended for trusted installed extensions. Same-origin extension code is not isolated from the host as untrusted code.

## Validation

The core has unit and browser tests for generic contributions, including a canned-reply widget.
In this repository, run `npm test` and `npm run test:browser`.
Browser tests use the actual ChatPane with a mock recognition engine.
Set its `XANGI_CORE_PATH` to this checkout and `XANGI_TEST_CHROMIUM` to a Chromium executable.

## Manifest and non-voice example

Keep the normal information page and declare a separate input widget:

```json
{ "ui": { "capability": "composer.input", "path": "/", "composer": { "path": "/composer/", "permissions": ["microphone"] } } }
```

A canned-reply extension can declare its own capability and widget path, omit permissions, and send `xangi.composer.insert` with a fresh request ID and text. No recognition engine, microphone permission, or begin/end messages are needed. The host acknowledges it with a new configure context; wait for that configuration before another action. The host never sends the draft to the widget.

The host discovers contributions on chat load and window focus, without periodic polling. Reload or refocus after extension installation, start, stop, or removal. Stopping a service while its window stays focused is not detected immediately.
