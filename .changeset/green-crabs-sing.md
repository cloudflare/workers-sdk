---
"@cloudflare/vite-plugin": minor
---

Add named tunnel support to the `cloudflare()` Vite plugin

You can now expose your local dev server publicly with a stable hostname by configuring `tunnel` with a named Cloudflare Tunnel:

```ts
cloudflare({
	tunnel: { name: "my-tunnel", autoStart: true },
});
```

If `autoStart` is omitted or set to `false`, you can still start or close the tunnel by pressing `t + enter`.
