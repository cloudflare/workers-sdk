---
"wrangler": minor
---

Add `--tunnel` flag to `wrangler dev` for sharing your local dev server via Cloudflare Quick Tunnels

You can now expose your local dev server publicly by passing `--tunnel`:

```sh
wrangler dev --tunnel
```

This starts a Cloudflare Quick Tunnel that gives you a random `*.trycloudflare.com` URL to share. The tunnel stops automatically when the dev session ends. Quick tunnels don't require a Cloudflare account or any configuration.

A warning is shown when Server-Sent Events (SSE) responses are detected through the tunnel, since quick tunnels have a 100-second idle timeout that may interrupt long-lived connections.
