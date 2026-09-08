---
"@cloudflare/vitest-plugin": patch
---

Fix `cloudflare:test` declarations composing with Wrangler-generated runtime types

The public test helpers now avoid private workers-types-only globals and use constraints compatible with generated runtime declarations, so strict projects can keep `skipLibCheck` disabled.
