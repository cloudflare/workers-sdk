---
"miniflare": patch
"create-cloudflare": patch
---

Fix startup failures in Miniflare and C3 when loading ESM dependencies

Miniflare and `create-cloudflare` can now load dependencies that use Node.js's `createRequire()` without failing on an invalid file URL. This prevents these dependencies from causing an error before the CLI or local development environment starts.
