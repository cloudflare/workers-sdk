---
"wrangler": patch
---

Prevent Wrangler from exiting when a process capturing its output closes the pipe.

Wrangler now ignores broken-pipe errors from stdout and stderr while preserving the existing failure behavior for other output errors.
