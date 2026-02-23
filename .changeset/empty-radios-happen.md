---
"@cloudflare/vite-plugin": minor
"@cloudflare/containers-shared": minor
"@cloudflare/workers-utils": minor
"miniflare": minor
"wrangler": minor
---

Add experimental support for containers to workers communication with interceptOutboundHttp

Containers can now intercept outbound HTTP requests and route them to Worker entrypoints.
This feature is experimental and requires enabling the "experimental" flag in your configuration.

