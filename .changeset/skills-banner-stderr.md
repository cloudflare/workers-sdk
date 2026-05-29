---
"wrangler": patch
---

Fix skills banner writing to stdout in non-interactive terminals, corrupting piped JSON

Previously, when wrangler detected AI coding agents in a non-interactive terminal, it printed an informational banner about available Cloudflare skills via `logger.log` (stdout). This would contaminate the output of commands like `wrangler deploy --json | jq`. The banner now correctly uses `logger.warn` (stderr) so that JSON output piped to other tools is unaffected.
