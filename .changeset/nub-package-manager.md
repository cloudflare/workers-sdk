---
"@cloudflare/workers-utils": minor
"@cloudflare/autoconfig": minor
"@cloudflare/cli-shared-helpers": minor
"wrangler": minor
---

Recognise nub as a package manager

wrangler now detects nub — from its `npm_config_user_agent` and an installed `nub` binary — and autoconfig detects nub projects by their `nub.lock`, alongside npm, pnpm, yarn, and bun. Package installation helpers use `nub`/`nubx` accordingly.
