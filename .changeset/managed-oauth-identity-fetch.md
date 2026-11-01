---
"@cloudflare/config": minor
"wrangler": minor
"miniflare": patch
"@cloudflare/codemods": patch
---

Support managed OAuth identity fetch configuration for WAG and client-credentials exchanges with DPoP. Validate fixed destination/scope policies, preserve them through migration and uploads, and infer public client metadata/assertion methods. Local identity selection remains explicitly unsupported and performs no credential exchange.
