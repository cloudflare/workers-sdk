# @cloudflare/workers-auth

## 0.4.0

### Minor Changes

- [#14156](https://github.com/cloudflare/workers-sdk/pull/14156) [`e1532eb`](https://github.com/cloudflare/workers-sdk/commit/e1532eba6681f4552ae02f6b435cc04f42cc9bdd) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Add opt-in OS keychain storage for OAuth credentials

  By default `wrangler` stores your OAuth tokens in a plaintext file, and that is unchanged. You can now opt in to encrypting them at rest instead: `wrangler login --use-keyring` writes the tokens to an AES-256-GCM-encrypted file whose key is held in your OS keyring (macOS Keychain, libsecret on Linux, or Windows Credential Manager). Existing plaintext credentials are migrated automatically on first use.

  Toggle it with any of:

  - `wrangler login --use-keyring` / `--no-use-keyring`
  - `wrangler auth keyring enable` / `disable` (or `wrangler auth keyring` to print the current setting) — useful if you only use named profiles and never run the global `wrangler login`
  - `CLOUDFLARE_AUTH_USE_KEYRING=true|false` to override the saved preference for a single command

  Opting out **deletes** the encrypted credentials rather than decrypting them back to disk, so you re-authenticate afterwards. The preference applies to every auth profile, and each named profile gets its own encrypted file and key.

  Per-platform requirements: macOS uses the built-in `security` tool (nothing to install); Linux uses `secret-tool` from `libsecret-tools` (wrangler prints an install hint if it is missing); Windows lazily installs `@napi-rs/keyring` (~1.9 MB) on first opt-in, and errors with instructions in non-interactive/CI contexts.

  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_API_KEY`/`CLOUDFLARE_EMAIL` continue to take priority over any stored OAuth credentials.

### Patch Changes

- Updated dependencies [[`aa5d580`](https://github.com/cloudflare/workers-sdk/commit/aa5d5801450b7e4417bfdbd477f86de3a4bc6933)]:
  - @cloudflare/workers-utils@0.25.0

## 0.3.2

### Patch Changes

- Updated dependencies [[`cfd6205`](https://github.com/cloudflare/workers-sdk/commit/cfd6205fe86f6afd74b5881f09524c93c83b8359), [`cfd6205`](https://github.com/cloudflare/workers-sdk/commit/cfd6205fe86f6afd74b5881f09524c93c83b8359)]:
  - @cloudflare/workers-utils@0.24.0

## 0.3.1

### Patch Changes

- [#14347](https://github.com/cloudflare/workers-sdk/pull/14347) [`673b09e`](https://github.com/cloudflare/workers-sdk/commit/673b09e0fa26368125fb527596a8eb5d31c27302) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Update undici from 7.24.8 to 7.28.0

- Updated dependencies [[`673b09e`](https://github.com/cloudflare/workers-sdk/commit/673b09e0fa26368125fb527596a8eb5d31c27302), [`5dfb788`](https://github.com/cloudflare/workers-sdk/commit/5dfb788595a2104b4b0922cfce3d69a2f1d881eb)]:
  - @cloudflare/workers-utils@0.23.2

## 0.3.0

### Minor Changes

- [#14042](https://github.com/cloudflare/workers-sdk/pull/14042) [`7e63948`](https://github.com/cloudflare/workers-sdk/commit/7e63948f9b31fce998b4902102395629e439a8e0) Thanks [@edevil](https://github.com/edevil)! - Add a `--temporary` flag that creates and uses a temporary Cloudflare preview account when you have no credentials, instead of starting the OAuth login flow.

  It's registered only on the commands the short-lived account token can serve — Workers (`deploy`, `versions upload`, and related commands), KV, D1, Hyperdrive, Queues, and certificate commands — and is for unauthenticated use only: passing it while already authenticated (OAuth, `CLOUDFLARE_API_TOKEN`, or a global API key) errors rather than silently ignoring the flag. Before provisioning, Wrangler handles Cloudflare's Terms of Service and Privacy Policy (interactive terminals prompt for `yes`; non-interactive shells print a notice and continue). Wrangler then runs with the short-lived token and prints a claim URL so the account can be claimed before it expires. The cached account is cleared on successful login or logout.

### Patch Changes

- Updated dependencies [[`ecfdd5a`](https://github.com/cloudflare/workers-sdk/commit/ecfdd5a6c60b9c6f99c28f9294da656933c2a5fd)]:
  - @cloudflare/workers-utils@0.23.1

## 0.2.0

### Minor Changes

- [#14185](https://github.com/cloudflare/workers-sdk/pull/14185) [`98c9afe`](https://github.com/cloudflare/workers-sdk/commit/98c9afe2e3bb6cbed6d56d8ad781d50e9a604926) Thanks [@penalosa](https://github.com/penalosa)! - Make the OAuth identity and token storage injectable, and add a shared env-credential resolver

  `createOAuthFlow` now takes the consumer's OAuth identity (`clientId`, `consent`, `redirectUri`) and token `storage` on its context, so other Cloudflare CLIs can reuse the flow under their own OAuth app and store tokens in their own location/format. Also adds a shared env→credential resolver (`getAuthFromEnv`, `getAPIToken`, `requireApiToken`).

### Patch Changes

- [#14213](https://github.com/cloudflare/workers-sdk/pull/14213) [`10b5538`](https://github.com/cloudflare/workers-sdk/commit/10b553819addbcd1224f66d5b52bb7c7f7c8e602) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Improve authentication error messages with specific failure reasons

  When authentication fails (e.g. during `wrangler dev --remote` or when using remote bindings), the error message now explains exactly what went wrong -- whether no credentials were found, the token expired, or the environment is non-interactive -- and lists actionable steps to fix it, including a `wrangler whoami` tip.

  Previously, auth failures could produce multiple confusing errors (e.g. "Failed to fetch auth token: 400 Bad Request" followed by "Failed to start the remote proxy session"). Now a single, clear error is shown.

## 0.1.1

### Patch Changes

- [#14121](https://github.com/cloudflare/workers-sdk/pull/14121) [`7539a9b`](https://github.com/cloudflare/workers-sdk/commit/7539a9bfcf03a14b2c16f281d541b6bc45523a80) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Extract the OAuth 2.0 + PKCE flow into a new `@cloudflare/workers-auth` package.

  The OAuth login / logout / refresh logic, the auth-config TOML file IO, the OAuth token exchange + local callback server, and the Cloudflare Access detection helpers that previously lived in `packages/wrangler/src/user/` have moved to the new internal-only `@cloudflare/workers-auth` package. Wrangler now wires the OAuth flow up via a small glue module that injects its logger, browser opener, interactivity detector, and config cache via a dependency- injection context.

  What stays in wrangler:

  - The yargs `login` / `logout` / `whoami` / `auth token` commands
  - Environment-based credential resolution (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_API_KEY` / `CLOUDFLARE_EMAIL`, etc.)
  - Cloudflare account selection (`requireAuth`, `getOrSelectAccountId`)
  - The OAuth scope catalog (passed into the OAuth flow as a generic `string[]`)
  - `whoami` / account fetching

  No behavior change for end users. The on-disk TOML format and location remain identical, and all telemetry message labels are preserved verbatim.

  `@cloudflare/workers-auth` is published with `prerelease: true` and is not intended for external use — its APIs may change without notice.

- [#14170](https://github.com/cloudflare/workers-sdk/pull/14170) [`ea12b58`](https://github.com/cloudflare/workers-sdk/commit/ea12b584ee1c3141286f0ecf6b742bd79971407e) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Tighten on-disk permissions of the OAuth credentials file to `0600`

  The user auth config file written by `wrangler login` (typically `~/.config/.wrangler/config/default.toml` on Linux/macOS, or `<environment>.toml` for non-production Cloudflare API environments) is now written with mode `0600` and re-`chmod`-ed on every save. This prevents other local users on shared hosts from reading the stored OAuth tokens. Existing files with looser permissions written by older Wrangler versions are tightened the next time Wrangler refreshes the token or the user logs in again. The change is a no-op on Windows, which does not honour POSIX mode bits.

- [#14022](https://github.com/cloudflare/workers-sdk/pull/14022) [`acf7817`](https://github.com/cloudflare/workers-sdk/commit/acf7817266b39be9707a09b918d670a468302ebc) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Show the actual OAuth error instead of hanging when `wrangler login` is rejected by the OAuth provider (for example with `invalid_scope`).

  Previously, if the OAuth callback returned with an `error` other than `access_denied`, Wrangler would never respond to the browser. Because `server.close()`'s callback only fires once all open connections have ended, the login command would hang until the 120 second OAuth timeout — at which point it would print a generic timeout message rather than the actual OAuth failure. The same gap existed for the case where the OAuth provider redirected back without an authorisation code, and for failures during the auth-code-to-access-token exchange.

  The OAuth provider's `error_description` (RFC 6749 §4.1.2.1) is now also surfaced, so the message includes the specific reason for the failure rather than just the bare `error` code. For example, a misconfigured staging scope now surfaces as:

  ```
  OAuth error: invalid_scope
    The OAuth 2.0 Client is not allowed to request scope 'browser:write'.
  ```

  instead of hanging silently.

- Updated dependencies [[`c6c61b5`](https://github.com/cloudflare/workers-sdk/commit/c6c61b59431443b2bcda25f3af7624dd2ce19b9b), [`b502d54`](https://github.com/cloudflare/workers-sdk/commit/b502d5445b9e9e030020a3d65c0334507393aa64), [`c4f45e8`](https://github.com/cloudflare/workers-sdk/commit/c4f45e8b8694c60fb1808f7fbb130e4b4893d20c)]:
  - @cloudflare/workers-utils@0.23.0
