# AGENTS.md — workers-auth

OAuth-2.0-with-PKCE flow against Cloudflare's `dash.cloudflare.com` (or staging /
custom-overridden) endpoints. Used by wrangler and (in future) other Cloudflare
CLIs. Internal-only — published as `prerelease: true`.

## STRUCTURE

- `src/pkce.ts` — PKCE code-verifier / code-challenge generation (RFC 7636)
- `src/errors.ts` — `ErrorOAuth2` class hierarchy + `toErrorClass` mapper
- `src/generate-auth-url.ts` — authorize URL builder
- `src/generate-random-state.ts` — CSRF state generator
- `src/env-vars.ts` — `WRANGLER_*` env-var getters for OAuth endpoints
- `src/access.ts` — Cloudflare Access detection + service-token / `cloudflared` headers
- `src/config-file/` — config-file storage. `file-storage.ts` owns the on-disk I/O (`createFileStorage(location)`, parsing, owner-only perms) parameterised by a `ConfigFileLocation` (`{ getPath, format }`, `format` being `"toml"` or `"json"`). Consumers configure only the _location_ (path + format) — both plain values, so a CLI can drive them from env vars. The default path helper (`getAuthConfigFilePath`) lives in `@cloudflare/workers-utils`; the consumer maps profile names to locations.
- `src/profiles.ts` — CLI-agnostic named-auth-profile store (`createProfileStore`, `validateProfileName`): profile config + directory-binding operations, parameterised by consumer-supplied storage operations.
- `src/state.ts` — `readStoredAuthState()` + `StoredAuthState` shape
- `src/token-exchange.ts` — auth-code → token + refresh-token rotation + `fetchAuthToken`
- `src/callback-server.ts` — local HTTP server for the OAuth callback (listens on the host/port from the consumer's `redirectUri`)
- `src/flow.ts` — `createOAuthFlow(ctx)` factory wiring everything together
- `src/context.ts` — `OAuthFlowContext` interface (DI surface)
- `src/test-helpers/` — MSW handlers for consumers' tests (`@cloudflare/workers-auth/test-helpers`)

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
- `storageFactory` (required) — `(profile?: string) => ConfigFileLocation`: maps an
  auth profile name to the auth-config file location (`{ getPath, format }`).
  workers-auth owns the file I/O; the consumer only says where/what format
  (wrangler: `defaultAuthConfigLocation(profile)`). Because it's plain values, it
  can be driven entirely from env vars (`CLOUDFLARE_AUTH_CONFIG_FILE`). The active
  profile defaults to `"default"`; set it via `OAuthFlowAPI.setProfile()`
- `purgeOnLoginOrLogout?()` — invalidate consumer-side caches after login/logout
- `generateAuthUrl?` / `generateRandomState?` — test overrides for deterministic
  snapshot tests (defaults pull from `./generate-auth-url` / `./generate-random-state`)

`clientId`, `consent`, `redirectUri`, and `storageFactory` are consumer-specific
(Wrangler's live in `packages/wrangler/src/user/`), so they are required rather
than defaulted here.

Wrangler wires this once in `packages/wrangler/src/user/user.ts`.

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
