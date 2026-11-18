---
"miniflare": patch
---

Fix missing types when using Miniflare with `skipLibCheck: false`

TypeScript projects importing Miniflare could fail with `Cannot find module './shared'`. The required types are now included in the published package, so projects can check Miniflare's declarations without this error.
