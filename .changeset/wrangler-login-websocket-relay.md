---
"wrangler": minor
---

Add experimental `--experimental-websocket-callback` (alias `--x-websocket-callback`) flag to `wrangler login` for OAuth flows in remote environments

The standard `wrangler login` flow requires Wrangler to host a local HTTP server on `localhost:8976` to receive the OAuth callback. This doesn't work well in containers, remote VMs, or Codespaces where `localhost` isn't accessible from the user's browser.

When run with `--experimental-websocket-callback`, Wrangler instead opens a WebSocket to a public auth relay worker (`auth.devprod.cloudflare.dev`). The OAuth callback hits the relay worker, which forwards the authorization code back to Wrangler over the WebSocket. Wrangler then exchanges the code for an access token using PKCE — the auth relay never sees the access token.

If the relay can't be reached (connect error, premature close, or 5s connect timeout), Wrangler logs a warning and automatically falls back to the existing local callback server. Both the connect timeout and the relay origin are now compiled into the build and cannot be overridden at runtime.

This flag is experimental and hidden while the relay is being rolled out. The intent is to make this the default behavior in the future.

#### Security hardening (REVIEW-17452)

Following an internal security review, the experimental flow has been hardened end-to-end:

- The relay origin (`https://auth.devprod.cloudflare.dev`) and connect timeout (5 seconds) are now build-time constants. Removed the `WRANGLER_AUTH_WORKER_ORIGIN` and `WRANGLER_AUTH_WORKER_TIMEOUT` environment variables — production deployments cannot redirect the relay to a hostile URL or disable the connect timer.
- Wrangler now generates a per-session `wsToken` and sends it via a custom `Sec-Wrangler-Client` header on the WebSocket upgrade. The header proves the upgrade did not originate from a malicious browser page (browsers cannot set custom request headers on the `WebSocket` constructor) and the relay scopes a successful `/callback` to the originating WebSocket.
- The relay echoes the `state` value in every WebSocket message; Wrangler timing-safe-compares it against the locally generated value before exchanging the code, defending against state injection.
- The relay rejects WebSocket upgrades that carry an `Origin` header (browser CSWSH defence), enforces a strict `state` regex on both `/session/:state` and `/callback`, refuses non-`GET` methods, latches a `delivered` flag to reject replayed callbacks, and emits security headers (`Referrer-Policy: no-referrer`, `Cache-Control: no-store, private`, `X-Content-Type-Options: nosniff`) on the redirect response. The `nodejs_compat` flag and Workers Logs URL capture are disabled on the relay worker.
- Wrangler refuses to start the OAuth flow when `NODE_TLS_REJECT_UNAUTHORIZED=0` is set (which would silently accept any TLS certificate), validates the relay's WebSocket message against a strict schema (single `code` xor `error`, no unknown fields, prototype-pollution-safe), caps a single relay frame at 4 KiB (`maxPayload`), and no longer prints the full OAuth URL (with `state` and `code_challenge`) to stdout.
- Auth tokens stored in `~/.wrangler/config/*.toml` are now written with mode `0600` and re-`chmod`-ed on every save so other local users on shared hosts cannot read them.
- Sentry crash reports run captured strings through an OAuth-secret scrubber that redacts `code=`, `state=`, `code_verifier=`, `wsToken=`, and JWT-shaped tokens before transmission.
- Wrangler now negotiates a custom WebSocket subprotocol (`wrangler-auth-relay-v1`) on the relay handshake and aborts if the relay doesn't echo it on the 101, adding a defence-in-depth layer on top of the `Sec-Wrangler-Client` header against browser-mediated CSWSH.
- The relay's `Upgrade` header check is now case-insensitive (RFC 6455 §1.3 compliant), the worker's redirect carries a `Vary: Origin` header (cache-key safety), all DO storage operations are wrapped in non-fatal try/catch so a transient backing-store failure cannot corrupt an in-flight session, and a `// SECURITY: do not set Access-Control-Allow-Origin` guardrail comment was added to deter future regressions.
- Renamed the `authUrl` parameter on `generateAuthUrl` to `authOrigin` and moved the `/oauth2/auth` path inside the function so the leading `?` cannot collide with a pre-existing query string in the env-var override. A new `getAuthOriginFromEnv()` helper extracts the origin from `WRANGLER_AUTH_URL` and surfaces a graceful `UserError` if that env var is malformed.
