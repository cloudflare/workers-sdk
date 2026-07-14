---
"@cloudflare/config": minor
"@cloudflare/deploy-helpers": minor
---

Publish `@cloudflare/config` package

`@cloudflare/config` is now published as a standalone package. Previously, its exports (`InputWorkerSchema`, `OutputWorkerSchema`, `convertToWranglerConfig`, and related types) were re-exported through `@cloudflare/deploy-helpers`. Consumers should import directly from `@cloudflare/config` instead.

`@cloudflare/deploy-helpers` no longer re-exports `@cloudflare/config` symbols.
