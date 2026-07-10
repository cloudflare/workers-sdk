---
"@cloudflare/workers-utils": patch
"@cloudflare/cli-shared-helpers": patch
---

Add nub to the list of recognised package managers

Projects using nub can now be automatically detected by their `nub.lock` file, and package installation helpers now support nub alongside npm, pnpm, yarn, and bun.
