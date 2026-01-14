---
"miniflare": minor
---

Add `MF-Original-Hostname` header when using the `upstream` option

When using the `upstream` option in Miniflare, the `Host` header is rewritten to match the upstream server, which means the original hostname is lost. This change adds a new `MF-Original-Hostname` header that preserves the original hostname from the incoming request.

This allows Workers to access the original hostname when proxying requests through an upstream server:

```js
export default {
	async fetch(request) {
		const originalHostname = request.headers.get("MF-Original-Hostname");
		// originalHostname contains the hostname before it was rewritten
	},
};
```
