---
"miniflare": patch
"wrangler": patch
"@cloudflare/vite-plugin": patch
---

Bump `ws` from 8.20.1 to 8.21.0 to address GHSA-96hv-2xvq-fx4p

[GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) / [CVE-2026-48779](https://www.cve.org/CVERecord?id=CVE-2026-48779) (high severity) reports a remote memory-exhaustion DoS in `ws@<8.21.0`: a peer sending a high volume of tiny fragments and data chunks over modest network traffic can crash a `ws` server or client via OOM. The fix shipped in [ws@8.21.0](https://github.com/websockets/ws/releases/tag/8.21.0) (commit `2b2abd45`, released 2026-05-22), which also introduces the `maxBufferedChunks` and `maxFragments` options. This change bumps the workspace catalog entry so that `miniflare`, `wrangler`, and `@cloudflare/vite-plugin` all pick up the patched release.
