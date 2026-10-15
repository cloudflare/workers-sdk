---
"@cloudflare/deploy-helpers": patch
---

Allow deploy-helpers consumers to supply the message shown when strict mode aborts a conflicting upload in a non-interactive session. Wrangler keeps its existing `--strict` guidance, while other CLIs can describe their own override flags.
