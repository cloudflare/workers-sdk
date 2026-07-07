---
"wrangler": patch
"@cloudflare/workers-utils": patch
---

Upgrade `signal-exit` from v3 to v4

The bundled `signal-exit` dependency was CJS-only. Upgrading to v4 (which ships a dual ESM/CJS build) unblocks ESM output. Exit-cleanup behaviour is unchanged, though v4 no longer registers handlers for a few signals that are no longer supported by the OS (`SIGUNUSED` on Linux; `SIGABRT`/`SIGALRM` on Windows).
