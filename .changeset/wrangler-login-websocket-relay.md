---
"wrangler": minor
---

Add experimental `--experimental-websocket-callback` (alias `--x-websocket-callback`) flag to `wrangler login` for OAuth flows in remote environments

The standard `wrangler login` flow requires Wrangler to host a local HTTP server on `localhost:8976` to receive the OAuth callback. This doesn't work well in containers, remote VMs, or Codespaces where `localhost` isn't accessible from the user's browser.

When run with `--experimental-websocket-callback`, Wrangler instead opens a WebSocket to a public auth relay worker (`auth.devprod.cloudflare.dev`). The OAuth callback hits the relay worker, which forwards the authorization code back to Wrangler over the WebSocket. Wrangler then exchanges the code for an access token using PKCE — the auth relay never sees the access token.

This flag is experimental and hidden while the relay is being rolled out. The intent is to make this the default behavior in the future.
