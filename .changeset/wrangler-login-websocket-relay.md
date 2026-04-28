---
"wrangler": minor
---

Add experimental `--experimental-websocket-callback` (alias `--x-websocket-callback`) flag to `wrangler login` for OAuth flows in remote environments

The standard `wrangler login` flow requires Wrangler to host a local HTTP server on `localhost:8976` to receive the OAuth callback. This doesn't work well in containers, remote VMs, or Codespaces where `localhost` isn't accessible from the user's browser.

When run with `--experimental-websocket-callback`, Wrangler instead opens a WebSocket to a public auth relay worker (`auth.devprod.cloudflare.dev`). The OAuth callback hits the relay worker, which forwards the authorization code back to Wrangler over the WebSocket. Wrangler then exchanges the code for an access token using PKCE — the auth relay never sees the access token.

If the relay can't be reached (connect error, premature close, or 5s connect timeout), Wrangler logs a warning and automatically falls back to the existing local callback server. The connect timeout and fallback can be tuned via `WRANGLER_AUTH_WORKER_TIMEOUT` (milliseconds). Setting it to `0` disables both the timeout and the fallback — useful in container/remote environments where you want relay-only behaviour with a clear failure if the relay is unreachable.

This flag is experimental and hidden while the relay is being rolled out. The intent is to make this the default behavior in the future.
