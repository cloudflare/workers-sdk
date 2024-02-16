---
"wrangler": patch
---

fix: wait for actual port before opening browser with `--port=0`

Previously, running `wrangler dev --remote --port=0` and then immediately pressing `b` would open `localhost:0` in your default browser. This change queues up opening the browser until Wrangler knows the port the dev server was started on.
