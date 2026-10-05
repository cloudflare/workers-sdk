---
"wrangler": patch
---

Print temporary account notices to stderr

The terms notice, the proof-of-work message, and the "Temporary account ready" claim details printed by `--temporary` now go to stderr instead of stdout. Previously they corrupted command output on stdout, such as the JSON from `wrangler kv namespace list --temporary` or the raw value from `wrangler kv key get --temporary`. Commands that lower the log level for `--json`, such as `wrangler d1 execute --json --temporary`, also hid the claim URL; it is now shown unless logging is disabled with `WRANGLER_LOG=none`.

Scripts that read the claim URL from stdout should read stderr instead.
