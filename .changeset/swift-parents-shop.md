---
"wrangler": patch
---

feat: support controlling metrics gathering via `WRANGLER_SEND_METRICS` environment variable

Setting the `WRANGLER_SEND_METRICS` environment variable will override any other metrics controls,
such as the `send_metrics` property in wrangler.toml and cached user preference.
