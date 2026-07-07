---
"miniflare": minor
---

Remove deprecated `supportedCompatibilityDate` export

The `supportedCompatibilityDate` export has been removed. Use `new Date().toISOString().slice(0, 10)` instead.
