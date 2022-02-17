---
"wrangler": patch
---

Refactored tail functionality in preparation for adding pretty printing.

- Moved the `debug` toggle from a build-time constant to a (hidden) CLI flag
- Implemented pretty-printing logs, togglable via `--format pretty` CLI option
- Added stronger typing for tail event messages
