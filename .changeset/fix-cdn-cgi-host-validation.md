---
"miniflare": patch
"wrangler": patch
"@cloudflare/vite-plugin": patch
---

Fix `/cdn-cgi/*` host validation incorrectly accepting subdomains of exact configured routes

Miniflare's `/cdn-cgi/*` host/origin validator was treating exact configured routes the same as wildcard configured routes, so a request whose `Host` or `Origin` hostname was a subdomain of an exact route (e.g. `sub.my-custom-site.com` for a `my-custom-site.com/*` route) was incorrectly accepted. Exact configured routes and the configured `upstream` hostname are now required to match the request hostname exactly. Subdomain matching is only applied to wildcard routes such as `*.example.com/*`. Localhost hostnames continue to be allowed as before.

This affects `wrangler dev` and local development through `@cloudflare/vite-plugin`, both of which use Miniflare under the hood.
