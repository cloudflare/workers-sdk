---
"wrangler": patch
---

Update Waku autoconfig logic

As of `1.0.0-alpha.4`, Waku projects can be built on top of the Cloudflare Vite plugin, and the changes here allow Wrangler autoconfig to support this. Running autoconfig on older versions of Waku will result in an error.
