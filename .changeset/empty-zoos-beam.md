---
"wrangler": patch
---

fix: automatically drain incoming request bodies

Previously, requests sent to `wrangler dev` with unconsumed bodies could result in `Network connection lost` errors. This change attempts to work around the issue by ensuring incoming request bodies are drained if they're not used. This is a temporary fix whilst we try to address the underlying issue. Whilst we don't think this change will introduce any other issues, it can be disabled by setting the `WRANGLER_DISABLE_REQUEST_BODY_DRAINING=true` environment variable. Note this fix is only applied if you've enabled Wrangler's bundling—`--no-bundle` mode continues to have the previous behaviour.
