---
"@cloudflare/workers-utils": minor
---

Remove `getLocalWorkerdCompatibilityDate` from the package

This utility has been removed because its implementation besides being unreliable is no longer needed. Callers should now use today's date as the compatibility date directly, e.g. via `getTodaysCompatDate()` from `@cloudflare/workers-utils`.
