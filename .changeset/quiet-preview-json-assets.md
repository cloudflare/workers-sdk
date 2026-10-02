---
"wrangler": patch
"@cloudflare/deploy-helpers": patch
---

Keep `wrangler preview --json` output parseable for Workers with static assets

Asset upload progress ("🌀 Building list of assets...", "✨ Read 1 file from the assets directory" and so on) was written to stdout ahead of the JSON payload, so scripts piping `wrangler preview --json` into a JSON parser failed for any Worker with assets. In `--json` mode that progress is now logged at debug level, and is still visible with `WRANGLER_LOG=debug`.
