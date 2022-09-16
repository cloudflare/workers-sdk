---
"wrangler": patch
---

polish: loglevel flag
Added a '--log-level' flag that allows the user to specify between 'debug', 'info', 'log', 'warning', 'error', 'none'
Currently 'none' will turn off all outputs in Miniflare (local mode), however, Wrangler will still output Errors.

resolves #185
