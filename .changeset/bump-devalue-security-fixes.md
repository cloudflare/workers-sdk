---
"miniflare": patch
"@cloudflare/vitest-plugin": patch
---

Bump bundled `devalue` from 5.6.3 to 5.9.3 to pick up security fixes

`devalue` is bundled into these packages, which use it to serialise values between Node.js and workerd. Version 5.6.3 is affected by several published advisories, and 5.9.3 includes their fixes. Serialisation behaviour does not change.
