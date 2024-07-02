---
"wrangler": patch
"@cloudflare/vitest-pool-workers": patch
---

Fix: pass env to getBindings to support reading `.dev.vars.{environment}`

https://github.com/cloudflare/workers-sdk/pull/5612 added support for selecting the environment of config used, but it missed passing it to the code that reads `.dev.vars.{environment}`

Closes #5641
