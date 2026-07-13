# AGENTS.md — workers-auth

OAuth-2.0-with-PKCE flow against Cloudflare's `dash.cloudflare.com` (or staging /
custom-overridden) endpoints. Used by wrangler and (in future) other Cloudflare
CLIs. Internal-only — published as `prerelease: true`.

## STRUCTURE

- `src/pkce.ts` — PKCE code-verifier / code-challenge generation (RFC 7636)
- `src/errors.ts` — `ErrorOAuth2` class hierarchy + `toErrorClass` mapper
- `src/generate-auth-url.ts` — authorize URL builder
- `src/generate-random-state.ts` — CSRF state generator
- `src/env-vars.ts` — `WRANGLER_*` and `CLOUDFLARE_AUTH_*` env-var getters
- `src/access.ts` — Cloudflare Access detection + service-token / `cloudflared` headers
- `src/config-file/auth.ts` — the `AuthConfigStorage` / `UserAuthConfig` storage contract (interfaces only). The default plaintext credential implementation lives alongside the credential-store layer at `src/credential-store/file-store.ts` (see "Credential storage" below). The core `src/core/auth-config-file.ts` (`createAuthConfigFileHelpers({getConfigPath, format})`) and `src/core/file-storage.ts` (`createFileStorage(format, getPath)`) build the per-profile path helpers and non-credential file stores; each CLI descriptor (`src/wrangler/auth-config-file.ts`, `src/cf/auth-config-file.ts`) binds them to its config dir + `FileFormat` and re-exports `createTomlFileStorage` / `createJsonFileStorage`, `getAuthConfigFilePath`, etc. from its entrypoint. See "CORE LAYER" below.
- `src/config-file/temporary.ts` — `TemporaryAccountStorage` / `TemporaryPreviewAccount` storage contract for the temporary-preview-account flow
- `src/config-file/index.ts` — generic `ConfigStorage<T>` interface shared by the auth and temporary-account contracts
- `src/state.ts` — `readStoredAuthState()` + `StoredAuthState` shape
- `src/token-exchange.ts` — auth-code → token + refresh-token rotation + `fetchAuthToken`
- `src/callback-server.ts` — local HTTP server for the OAuth callback (listens on the host/port from the consumer's `redirectUri`)
- `src/flow.ts` — `createOAuthFlow(ctx)` factory wiring everything together
- `src/context.ts` — `OAuthFlowContext` interface (DI surface)
- `src/credential-store/` — opt-in OS-keyring-backed credential persistence (see below)
- `src/test-helpers/` — MSW handlers for consumers' tests (`@cloudflare/workers-auth/test-helpers`)

### Credential storage (`src/credential-store/`)

Pluggable credential persistence layer that consumers can wire into the
OAuth flow via `ctx.storageFactory`. Default backend is the plaintext
TOML file (`FileCredentialStore`); an opt-in `EncryptedFileCredentialStore`
writes AES-256-GCM-encrypted credentials to a sibling `.enc` file using a
key held in the OS keyring. Every store is profile-aware: the file path,
the encrypted `.enc` path, and the keyring account name are all derived from
`resolveAuthProfileBaseName(profile)` (default profile → environment-based
name; named profile → the profile name), so each auth profile gets its own
files and its own encryption key.

- `interface.ts` — `CredentialStore` interface (extends `AuthConfigStorage` with `kind` and `describe()`)
- `file-store.ts` — `FileCredentialStore` (plaintext TOML, default)
- `encrypted-file-store.ts` — `EncryptedFileCredentialStore` + plaintext-TOML migration
- `crypto.ts` — AES-256-GCM `encryptString` / `decryptString` helpers
- `resolver.ts` — `createCredentialStorageContext({...})` factory; returns `{ storageFactory, getActiveStore }` (both take an optional `profile`) for the consumer to plug into `createOAuthFlow` (as `ctx.storageFactory`) and `whoami`-style reporting respectively
- `state.ts` — module-level per-session resolver flags (one-time warnings, the Windows install-failed latch)
- `key-providers/` — per-platform OS-keyring backends that store only the 32-byte encryption key (never the credential blob itself, so the macOS Keychain 2.5 KB item limit is never a concern):
  - `interface.ts` — `KeyProvider` interface
  - `mac-security.ts` — `/usr/bin/security` shell-out
  - `linux-secret-tool.ts` — `secret-tool` shell-out (probes `libsecret-tools`)
  - `napi-keyring.ts` — `@napi-rs/keyring` wincred binding on Windows
  - `lazy-installer.ts` — Windows-only `npm install @napi-rs/keyring` on first opt-in
  - `factory.ts` — `resolveKeyProvider(serviceName)` picks the right per-platform implementation
  - `shared.ts` — account-name derivation + keyring JSON envelope encoding

## DI SURFACE

`createOAuthFlow(ctx)` accepts a context object:

- `logger` — drop-in replacement for wrangler's logger singleton
- `isNonInteractiveOrCI()` — whether to suppress interactive prompts
- `openInBrowser(url)` — opens the browser to the OAuth authorize URL
- `hasEnvCredentials()` — short-circuits refresh logic when env-based auth is set
- `clientId` (required) — the consumer's registered OAuth app ID; `string` or
  `() => string` for lazy (e.g. env-driven prod/staging) resolution
- `consent` (required) — the consumer's branded granted/denied consent pages
- `redirectUri` (required) — the registered redirect URI / local callback URL.
  The callback server's listen host/port and route path are all derived from it
  (per-call bind overrides via `LoginProps.callbackHost`/`callbackPort`)
- `storageFactory` (required) — maps an auth profile to the consumer's
  `AuthConfigStorage` token-persistence backend. The flow calls it with the
  active profile on every credential access. For keyring opt-in, pass the
  `storageFactory` from `createCredentialStorageContext(...)` rather than a raw
  file store, so both the active profile and the encrypted-file / plaintext
  choice are re-resolved on every credential operation.
- `purgeOnLoginOrLogout?()` — invalidate consumer-side caches after login/logout
- `generateAuthUrl?` / `generateRandomState?` — test overrides for deterministic
  snapshot tests (defaults pull from `./generate-auth-url` / `./generate-random-state`)

`clientId`, `consent`, `redirectUri`, and `storageFactory` are consumer-specific,
so they are required rather than defaulted here. Wrangler's values live in the
in-package wrangler layer (`src/wrangler/`, see below) rather than in the
`wrangler` package itself.

The wrangler layer (`src/wrangler/index.ts`, `createWranglerAuth`) wires the
credential-storage layer once via `createCredentialStorageContext(...)` and
exposes the resulting `getActiveStore` (called with the active profile) as
`getCredentialStore()` for `whoami`-style code that wants to surface the active
storage location.

## CORE LAYER (`src/core/`) + PER-CLI DESCRIPTORS (`src/wrangler/`, `src/cf/`)

The whole CLI-facing auth layer (the machinery that used to live in
`packages/wrangler/src/user/`) is **CLI-agnostic** and shared by every
Cloudflare CLI built on this package. It lives in `src/core/`:

- `factory.ts` — `createCloudflareAuth(descriptor, ctx)`: OAuth flow wiring,
  credential storage, config cache (`@cloudflare/workers-utils`'
  `createConfigCache`), account selection (`fetchInternalBase` with the token
  the flow already holds), login / logout / refresh, and `requireAuth`. Imports
  only `@cloudflare/workers-utils`.
- `types.ts` — `AuthContext` (the injected primitives: `logger`, `userAgent`,
  interactive `prompt` / `select`, `isNoDefaultValueProvidedError`) and
  `CliDescriptor` (everything that varies per CLI: `cliName`, `keyringServiceName`,
  `clientId`, `consent`, `redirectUri`, `getConfigPath`, `fileFormat`,
  `accountCachePrefix`, `cacheNamespace`, `getConfigFileLabel`,
  `getDefaultScopeKeys`, …).
- `file-storage.ts` (`createFileStorage(format, getPath)`), `auth-config-file.ts`
  (`createAuthConfigFileHelpers({getConfigPath, format})`), `preferences.ts`
  (`createPreferences(getConfigPath)`), `profile-store.ts`
  (`createCloudflareProfileStore`), `keyring-preference.ts`
  (`createKeyringPreference`), `scopes.ts` (shared Cloudflare scope catalog),
  `file-format.ts`, `temporary-terms.ts`.

**File format** is the `FileFormat` axis (`src/core/file-format.ts`): a simple
`"toml" | "json"` union (the value doubles as the file extension) plus
`parseFile` / `stringifyFile` helpers. It's threaded through `createFileStorage`
and the credential store (`FileCredentialStore` / `EncryptedFileCredentialStore`
/ `resolver.ts` all take an optional `format`, defaulting to `"toml"` so wrangler
is unchanged; the encrypted `.enc` sibling is format-independent). Wrangler uses
`"toml"`; cf uses `"json"`.

Each CLI is a thin **descriptor + entrypoint**:

- `src/wrangler/` → `@cloudflare/workers-auth/wrangler`: `WRANGLER_CLI`
  (TOML, wrangler's global config dir, wrangler's OAuth app / `"wrangler"`
  keyring service) + `createWranglerAuth(ctx) = createCloudflareAuth(WRANGLER_CLI, ctx)`.
  Re-exports everything wrangler's `src/user/*` imports (`createTomlFileStorage`,
  `readUserPreferences`, `createWranglerProfileStore`, `setKeyringPreference`,
  scopes, `getClientIdFromEnv`, `OAUTH_CALLBACK_URL`, …) — no re-export shim
  files remain in `wrangler/src/user/`.
- `src/cf/` → `@cloudflare/workers-auth/cf`: `CF_CLI` (JSON files under
  `~/.config/cloudflare`, the `"cloudflare"` keyring service, `CLOUDFLARE_CLIENT_ID`)
  - `createCfAuth(ctx)`. OAuth-app values (client ID `cbca97e7-…`, callback port
    8877, `cf-oauth-consent-*` pages, scoped-token-only auth) mirror the `cf`
    CLI's registration. cf carries its own scope catalog (`src/cf/scopes.ts`) —
    the full Cloudflare product surface as a flat list (no per-scope
    descriptions), distinct from wrangler's smaller `src/core/scopes.ts`
    key → description map — so it does not re-export `DefaultScopes`.

## CONVENTIONS

- License: dual MIT/Apache-2.0. Files derived from
  [BitySA/oauth2-auth-code-pkce](https://github.com/BitySA/oauth2-auth-code-pkce)
  carry the Apache-2.0 header.
- No `console.*` — use the injected `ctx.logger`.
- No global `fetch` — use undici's `fetch`.
- `UserError` instances must carry stable `telemetryMessage` labels
  (`<area> <sub-area> <failure>`, e.g. `user oauth invalid scope`).
  These labels are part of the telemetry contract — preserve them verbatim.
- No direct Cloudflare REST API calls. This package talks to OAuth endpoints
  (`/oauth2/auth`, `/oauth2/token`, `/oauth2/revoke`) only.
- OAuth callback server listens on the host/port derived from the consumer's
  required `ctx.redirectUri`; override the bind address per-call via
  `LoginProps.callbackHost` / `callbackPort`.

## BUILD

- tsup: two entry points — `src/index.ts` and `src/test-helpers/index.ts`
- ESM-only output to `dist/`
- `@cloudflare/*`, `undici`, `msw`, and `vitest` are kept external

## CREDENTIAL STORAGE NOTES

- The encrypted file uses `AES-256-GCM` via `node:crypto` (no third-party
  crypto deps). The 12-byte IV is generated fresh per write; the 16-byte
  GCM auth tag is verified on every read.
- The keyring entry holds only a 32-byte AES key wrapped in a small JSON
  envelope (`{v, key, created}`). It's well under the macOS Keychain ~2.5 KB
  per-item limit no matter how the credential schema grows.
- `@napi-rs/keyring` (the Windows backend's native binding) is installed
  lazily on first opt-in via `npm install` into `<configPath>/native/keyring/`,
  where `configPath` is the consumer-provided global config directory (see
  `getConfigPath` below) — so each CLI's binding lives under its own config dir.
  Pinned to `PINNED_KEYRING_VERSION` so CI users running
  `npm install -g @napi-rs/keyring` by hand get the same version as the
  lazy-install path.
- The credential files (`.toml` / `.enc`) and the keyring install dir are all
  rooted at the consumer's config directory. `@cloudflare/workers-auth` never
  resolves that path itself (wrangler and a future `cf` CLI use different global
  config paths); instead the consumer passes `getConfigPath: () => string` into
  `createCredentialStorageContext`, and the path helpers
  (`getAuthConfigFilePath` / `getEncryptedAuthConfigFilePath` /
  `getKeyringInstallDir`) and store constructors all take it explicitly.
- The consumer's `createCredentialStorageContext` call captures `serviceName`,
  `getConfigPath`, `isKeyringEnabled`, `logger`, `isNonInteractiveOrCI`, and
  `cliName` in a closure. The returned `storageFactory(profile)` re-resolves
  the active store on every call so the active profile, `--use-keyring` /
  `--no-use-keyring`, and the `CLOUDFLARE_AUTH_USE_KEYRING` env var all take
  effect without rebuilding the OAuth flow. Per-session memoization flags
  (`hasWarnedAboutKeyringFallback`, `installFailedThisSession`, ...) still
  live at module scope in `state.ts`; tests use
  `resetCredentialStorageState` to clear them between cases and
  `setKeyProviderFactoryForTesting` to swap in stubs.
