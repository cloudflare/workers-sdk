---
"wrangler": patch
---

Display build errors for auxiliary workers in multi-worker mode

Previously, when running `wrangler dev` with multiple `-c` config flags (multi-worker mode), build errors from auxiliary/secondary workers were only logged at debug level, causing Wrangler to silently hang. Build errors from all workers are now displayed at error level so you can see what went wrong and fix it.
