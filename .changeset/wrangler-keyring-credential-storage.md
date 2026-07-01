---
"wrangler": minor
"@cloudflare/workers-auth": minor
---

Add opt-in OS keychain storage for OAuth credentials

By default `wrangler` stores your OAuth tokens in a plaintext file, and that is unchanged. You can now opt in to encrypting them at rest instead: `wrangler login --use-keyring` writes the tokens to an AES-256-GCM-encrypted file whose key is held in your OS keyring (macOS Keychain, libsecret on Linux, or Windows Credential Manager). Existing plaintext credentials are migrated automatically on first use.

Toggle it with any of:

- `wrangler login --use-keyring` / `--no-use-keyring`
- `wrangler auth keyring enable` / `disable` (or `wrangler auth keyring` to print the current setting) — useful if you only use named profiles and never run the global `wrangler login`
- `CLOUDFLARE_AUTH_USE_KEYRING=true|false` to override the saved preference for a single command

Opting out **deletes** the encrypted credentials rather than decrypting them back to disk, so you re-authenticate afterwards. The preference applies to every auth profile, and each named profile gets its own encrypted file and key.

Per-platform requirements: macOS uses the built-in `security` tool (nothing to install); Linux uses `secret-tool` from `libsecret-tools` (wrangler prints an install hint if it is missing); Windows lazily installs `@napi-rs/keyring` (~1.9 MB) on first opt-in, and errors with instructions in non-interactive/CI contexts.

`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_API_KEY`/`CLOUDFLARE_EMAIL` continue to take priority over any stored OAuth credentials.
