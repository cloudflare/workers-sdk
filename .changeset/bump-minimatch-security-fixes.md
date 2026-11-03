---
"wrangler": patch
"miniflare": patch
"create-cloudflare": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
"@cloudflare/workers-utils": patch
"@cloudflare/codemods": patch
---

Bump bundled `minimatch` from 5.1.6 to 5.1.9 to pick up security fixes

These packages bundle `minimatch`, and 5.1.6 is affected by published ReDoS advisories. Version 5.1.9 includes the fixes. 5.1.8 is skipped because it broke recursive `**` matching, which D1's `migrations_pattern` relies on.
