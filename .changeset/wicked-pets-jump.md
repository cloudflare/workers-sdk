---
"wrangler": patch
---

fix: respect `WRANGLER_LOG` in `wrangler dev`

Previously, `--log-level=debug` was the only way to see debug logs in `wrangler dev`, which was unlike all other commands.
