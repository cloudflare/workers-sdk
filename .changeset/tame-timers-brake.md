---
"wrangler": patch
---

Don't exit on initial Pages Functions compilation failure

Previously, we'd exit the `wrangler pages dev` process if we couldn't immediately compile a Worker from the `functions` directory. We now log the error, but don't exit the process. This means that proxy processes can be cleaned up cleanly on SIGINT and SIGTERM, and it matches the behavior of if a compilation error is introduced once already running (we don't exit then either).
