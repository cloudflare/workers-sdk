---
"@cloudflare/vite-plugin": minor
---

Add `tunnel: "my-tunnel"` to the `cloudflare()` Vite plugin for sharing your local dev server via a named Cloudflare Tunnel

You can now expose your local dev server publicly with a stable hostname by setting `tunnel` to an existing tunnel name:

```ts
cloudflare({
	tunnel: "my-tunnel",
});
```

This uses an existing named Cloudflare Tunnel instead of creating a temporary `*.trycloudflare.com` Quick Tunnel. If you use `vite preview`, make sure the tunnel hostname is allowed by `preview.allowedHosts`.
