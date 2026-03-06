---
"@cloudflare/local-explorer-ui": patch
---

Refactors KV & sidebar to use route loaders.

This change improves the user experience of the Local Explorer dashboard by ensuring that the data used for the initial render is fetched server-side and passed down to the client. This avoids the initial flicker when loading in. Both D1 & Durable Object routes already incorporate this system.
