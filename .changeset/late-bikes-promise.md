---
"wrangler": patch
---

fix: when the worker's request.url is overridden using the `host` or `localUpstream`, ensure `port` is overridden/cleared too

When using `--localUpstream=example.com`, the request.url would incorrectly be "example.com:8787" but is now "example.com".

This only applies to `wrangler dev --x-dev-env` and `unstable_dev({ experimental: { devEnv: true } })`.
