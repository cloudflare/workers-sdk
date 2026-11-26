---
"@cloudflare/deploy-helpers": patch
---

Warn when a Preview from Build Output is missing bindings that have no resource ID

`previewBuildOutput()` leaves out KV, D1, and R2 bindings without a resource ID so that the Preview can take them from the Preview base config. When the Preview base config doesn't define them either, the bindings were missing from the Preview without any warning, and code that used them failed at runtime. A warning now lists these bindings. It is written to stderr, so it also appears in JSON mode without changing the JSON output.
