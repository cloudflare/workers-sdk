---
"@cloudflare/workers-utils": patch
"@cloudflare/autoconfig": patch
"@cloudflare/cli-shared-helpers": patch
"wrangler": patch
---

Recognise nub as a package manager

wrangler now detects nub — from its `npm_config_user_agent` and an installed `nub` binary — and autoconfig detects nub projects by their `nub.lock`, alongside npm, pnpm, yarn, and bun. Package installation helpers use `nub`/`nubx` accordingly.
