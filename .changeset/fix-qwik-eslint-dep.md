---
"create-cloudflare": patch
---

Fix Qwik project creation failing due to `@eslint/js` dependency conflict

The Qwik CLI generates projects with `@eslint/js` set to `"latest"`, which now resolves to v10 and requires `eslint@^10.0.0`. This conflicts with the project's pinned `eslint@9.x`, causing `npm install` to fail with an ERESOLVE error. C3 now pins `@eslint/js` to match the project's eslint version after scaffolding.
