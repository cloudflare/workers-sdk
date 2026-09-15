---
"create-cloudflare": patch
"wrangler": patch
"@cloudflare/vite-plugin": patch
---

Sync Local Explorer endpoint lists across agent hints

The Local Explorer endpoint list is now consistent across the three places it appears: the AGENTS.md template in `create-cloudflare`, the runtime agent hint in `wrangler dev`, and the Vite plugin agent hint. All three now include the `observability/clear` endpoint, use the canonical `/cdn-cgi/local/explorer` path, and have cross-reference comments pointing to each other.
