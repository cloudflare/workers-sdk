---
"miniflare": patch
---

fix: disable undici Pool request timeouts for local dev

Miniflare's undici `Pool` instances were using the default `headersTimeout` and `bodyTimeout` of 300 seconds (5 minutes). Any request taking longer than that — streaming responses, large uploads, long-polling, or compute-heavy Workers — would be silently killed with a "request failed" error.

Setting both timeouts to `0` disables them entirely, which is the correct behaviour for a local development tool where there is no reason to enforce request timeouts.
