---
"wrangler": patch
---

Fix: wrangler pages dev --script-path argument when using a proxy command instead of directory mode

Fixes a regression in wrangler@3.x, where `wrangler pages dev --script-path=<my script path> -- <proxy command>` would start throwing esbuild errors.
