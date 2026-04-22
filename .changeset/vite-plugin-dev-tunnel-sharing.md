---
"@cloudflare/vite-plugin": minor
---

Add `tunnel: true` to the `cloudflare()` Vite plugin for sharing your local dev server via Cloudflare Quick Tunnels

You can now expose your local dev server publicly by setting `tunnel: true`:

```ts
cloudflare({
	tunnel: true,
});
```

You can also enable tunnel sharing dynamically using an environment variable:

```ts
cloudflare({
	tunnel: process.env.ENABLE_DEV_TUNNEL === "true",
});
```

This starts a Cloudflare Quick Tunnel that gives you a random `*.trycloudflare.com` URL to share. The tunnel stops automatically when the dev session ends. Quick tunnels don't require a Cloudflare account or any configuration.

A warning is shown when Server-Sent Events (SSE) responses are detected through the tunnel, since quick tunnels don't support SSE.
