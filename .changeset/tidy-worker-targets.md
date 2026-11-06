---
"@cloudflare/codemods": patch
---

Preserve Worker target names when migrating legacy service environments

The Wrangler-to-cf migration now ignores legacy `environment` keys on service bindings, dispatch namespace outbound targets, and tail consumers. These targets retain their source service names without an environment suffix or an environment-only review TODO.
