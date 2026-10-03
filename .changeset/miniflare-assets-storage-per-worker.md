---
"miniflare": patch
---

Serve each Worker's own static assets when several Workers with assets run together

When several Workers with static assets ran in one Miniflare instance, such as `wrangler dev` with multiple `-c` configs or the test harness, every Worker read its assets from the same Worker's directory. Other Workers got 404s or that Worker's file at the same path. Each Worker now reads its own assets directory.
