---
"@cloudflare/vite-plugin": patch
---

Add experimental support for Workers Assets metafiles (\_headers and \_redirects) in `vite dev`.

This is behind an experimental option in the cloudflare plugin configuration:

```ts
cloudflare({
	// ...
	experimental: { headersAndRedirectsDevModeSupport: true },
}),
```

Currently, in this experimental mode, requests that would result in an HTML response or a 404 response will take into account the \_headers and \_redirects settings.
Known limitation: requests for existing static assets will be served directly by Vite without considering the \_headers or \_redirects settings.

A production deployment or `vite preview` already accurately supports these settings.
