---
"miniflare": patch
"wrangler": patch
"@cloudflare/vite-plugin": patch
---

Bump `ws` from 8.18.0 to 8.20.1 to address GHSA-58qx-3vcg-4xpx

[GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx) / [CVE-2026-45736](https://www.cve.org/CVERecord?id=CVE-2026-45736) reports an uninitialized-memory disclosure in `ws@<8.20.1` when a `TypedArray` is passed as the reason argument to `WebSocket.close()`. The fix shipped in [ws@8.20.1](https://github.com/websockets/ws/commit/c0327ec15a54d701eb6ccefaa8bef328cfc03086) on 2026-05-12. This change bumps the workspace catalog entry so that `miniflare`, `wrangler`, and `@cloudflare/vite-plugin` all pick up the patched release.
