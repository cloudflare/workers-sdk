---
"@cloudflare/vitest-pool-workers": patch
---

Reduce default log verbosity from `VERBOSE` to `WARN`

The pool logger was previously hardcoded to `VERBOSE`, causing noisy debug and informational messages on every test run (e.g. `[vpw:debug] Adding compatibility flag...`, `[vpw:info] Starting runtime...`). Only actionable warnings and errors are now printed by default.

For debugging, set `NODE_DEBUG=vitest-pool-workers` to restore the detailed output.
