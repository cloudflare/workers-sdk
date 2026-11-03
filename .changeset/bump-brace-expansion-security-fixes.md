---
"wrangler": patch
"miniflare": patch
"create-cloudflare": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
"@cloudflare/workers-utils": patch
"@cloudflare/codemods": patch
"@cloudflare/autoconfig": patch
---

Bump bundled `brace-expansion` to pick up security fixes

These packages bundle `brace-expansion` (a dependency of `minimatch`), and the bundled versions were affected by published advisories. The bundles now include `brace-expansion` 2.1.7 (from 2.0.1) and 5.0.12 (from 5.0.5). Normal glob patterns expand as before; only the pathological patterns targeted by the advisories are handled differently.
