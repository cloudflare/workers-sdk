---
"@cloudflare/vitest-pool-workers": patch
---

Reduce default log verbosity from `VERBOSE` to `INFO`

The pool logger was previously hardcoded to `VERBOSE`, causing noisy debug messages on every test run (e.g. `[vpw:debug] Adding compatibility flag...`). Only informational, warning, and error messages are now printed by default.

For debugging, set `NODE_DEBUG=vitest-pool-workers` to restore the detailed output.
