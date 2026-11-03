# Voice input setup guide for setup agents

English | [日本語](XANGI_SETUP.ja.md)

Guide users through review and approval without requiring them to research settings or commands.
Do not request approval again for an operation already approved in the current session.

First explain that this extension uses Google Chrome's speech recognition, and remote access requires HTTPS through Tailscale Serve.
Do not guarantee support in other browsers or on every OS and device.
Explain that audio may be sent to Chrome's speech recognition service.
Recognition uses Japanese (`ja-JP`); English documentation does not change the language or localize the interface.

1. Read the README and manifest. Confirm that the running Xangi supports `ui.composer` and the `draft.snapshot` host capability.
   Run `xangi extension link` and `xangi extension start` in the environment targeting that Xangi instance.
2. Trusted HTTPS needs no additional HTTPS setup. Localhost use on the same device also needs none.
   Continue below only for HTTP access from another device.
3. Identify the Xangi host and its actual HTTP listening address and port from the current configuration.
   For Docker, use the host-published port and run the commands below on the host.
   Ask for the target if unknown rather than guessing. Do not save environment-specific URLs, hostnames, or IP addresses in the repository.
4. Run `node src/setup-https.mjs --target <this host's Xangi HTTP URL> --check`.
   The helper detects the current Tailscale DNS name and reuses a suitable HTTPS endpoint or selects an unused port.
   Do not switch tailnets or modify other Serve settings.
5. If Tailscale is missing, explain the official OS-specific installation method and obtain approval before installing.
   Ask the user to sign in through the official authentication page. Never request passwords or authentication keys in chat.
   The client must also connect to the same tailnet. Let the user choose if multiple accounts are available.
6. If a new endpoint is needed, show its URL and explain that this Xangi will become accessible over HTTPS within the same tailnet.
   Obtain approval, then rerun with `--yes` instead of `--check`.
   If an HTTPS activation URL appears, ask the user to open it and approve activation, then rerun.
   Explain and obtain approval for OS administrator operations. Do not enable Funnel or reset Serve.
7. Open the resulting HTTPS URL with certificate verification enabled and confirm Xangi is available.
   If verification fails, inspect listening settings, the upstream target, and permissions. Do not report completion.
8. Give the user the HTTPS URL and ask them to open it in Google Chrome, press the microphone, and allow microphone access.
   Recognition never sends the draft automatically. Ask the user to verify actual recognition on their device.

Enabling the extension does not automatically grant OS or Tailscale permissions.
A setup agent must inspect and configure the environment. Normal startup does not change Serve settings.
