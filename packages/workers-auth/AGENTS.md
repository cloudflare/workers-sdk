# AGENTS.md — workers-auth

OAuth-2.0-with-PKCE flow against Cloudflare's `dash.cloudflare.com` (or staging /
custom-overridden) endpoints. Used by wrangler and (in future) other Cloudflare
CLIs. Internal-only — published as `prerelease: true`.

## STRUCTURE

- `src/pkce.ts` — PKCE code-verifier / code-challenge generation (RFC 7636)
- `src/errors.ts` — `ErrorOAuth2` class hierarchy + `toErrorClass` mapper
- `src/generate-auth-url.ts` — authorize URL builder + `OAUTH_CALLBACK_URL`
- `src/generate-random-state.ts` — CSRF state generator
- `src/env-vars.ts` — `WRANGLER_*` env-var getters for OAuth endpoints
- `src/access.ts` — Cloudflare Access detection + service-token / `cloudflared` headers
- `src/auth-config-file.ts` — read/write the persisted TOML at `<globalWranglerConfigPath>/config/<env>.toml`
- `src/state.ts` — `readStoredAuthState()` + `StoredAuthState` shape
- `src/token-exchange.ts` — auth-code → token + refresh-token rotation + `fetchAuthToken`
- `src/callback-server.ts` — local HTTP server on `localhost:8976` for the OAuth callback
- `src/flow.ts` — `createOAuthFlow(ctx)` factory wiring everything together
- `src/context.ts` — `OAuthFlowContext` interface (DI surface)
- `src/test-helpers/` — MSW handlers for consumers' tests (`@cloudflare/workers-auth/test-helpers`)

## DI SURFACE

`createOAuthFlow(ctx)` accepts a context object:

- `logger` — drop-in replacement for wrangler's logger singleton
- `isNonInteractiveOrCI()` — whether to suppress interactive prompts
- `openInBrowser(url)` — opens the browser to the OAuth authorize URL
- `hasEnvCredentials()` — short-circuits refresh logic when env-based auth is set
- `purgeOnLoginOrLogout()` — invalidate consumer-side caches after login/logout
- `generateAuthUrl?` / `generateRandomState?` — test overrides for deterministic
  snapshot tests (defaults pull from `./generate-auth-url` / `./generate-random-state`)

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
- OAuth callback server listens on `localhost:8976` by default; override via
  `LoginProps.callbackHost` / `callbackPort` per-call.

## BUILD

- tsup: two entry points — `src/index.ts` and `src/test-helpers/index.ts`
- ESM-only output to `dist/`
- `@cloudflare/*`, `undici`, `msw`, and `vitest` are kept external
