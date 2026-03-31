---
"miniflare": minor
---

Deprecate `supportedCompatibilityDate` export

The `supportedCompatibilityDate` export is now deprecated. Instead of relying on the workerd-derived compatibility date, callers should just use today's date directly, e.g. `new Date().toISOString().slice(0, 10)`.
