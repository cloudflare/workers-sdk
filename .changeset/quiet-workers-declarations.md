---
"miniflare": patch
"@cloudflare/config": patch
---

Fix public Miniflare declaration imports and preserve their source types

Miniflare's published types now bundle private workspace definitions, resolve the current package's declarations, and preserve the source-map-support namespace. Shared Worker definitions are emitted as declarations before bundling, avoiding missing imports and invalid initializers in the published declaration file. Schemas and binding options referenced by public types have explicit exports, with a regression that checks the built declarations and their runtime schema exports.
