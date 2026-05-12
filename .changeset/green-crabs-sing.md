---
"@cloudflare/vite-plugin": minor
---

Add named tunnel support to the `cloudflare()` Vite plugin

You can now expose your local dev server publicly with a stable hostname by configuring `tunnel` with a named Cloudflare Tunnel:

```ts
cloudflare({
	tunnel: { autoStart: true, name: "my-tunnel" },
});
```

If `autoStart` is omitted or set to `false`, the tunnel will not start automatically, but you can still start it from the interactive dev session.

This uses an existing named Cloudflare Tunnel instead of creating a temporary `*.trycloudflare.com` Quick Tunnel. If you use `vite preview`, make sure the tunnel hostname is allowed by `preview.allowedHosts`.
