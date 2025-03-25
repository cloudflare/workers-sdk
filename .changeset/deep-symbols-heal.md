---
"@cloudflare/vite-plugin": patch
---

Experimental: add support for Workers Assets metafiles (\_headers and \_redirects) in `vite dev`.

**Experimental feature**: This feature is being made available behind an experimental option (`headersAndRedirectsDevModeSupport`) in the cloudflare plugin configuration. It could change or be removed at any time.

```ts
cloudflare({
	// ...
	experimental: { headersAndRedirectsDevModeSupport: true },
}),
```

Currently, in this experimental mode, requests that would result in an HTML response or a 404 response will take into account the \_headers and \_redirects settings.

Known limitation: requests for existing static assets will be served directly by Vite without considering the \_headers or \_redirects settings.

Production deployments or using `vite preview` already accurately supports the `_headers` and `_footers` features. The recommendation is to use `vite preview` for local testing of these settings.
