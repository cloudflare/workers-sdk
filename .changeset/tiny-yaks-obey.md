---
"wrangler": minor
---

Enabling or disabling `workers_dev` is often an indication that
the user is also trying to enable or disable `preview_urls`. Warn the
user when these enter mixed state.
