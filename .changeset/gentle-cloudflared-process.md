---
"@cloudflare/workers-utils": minor
---

Add a reusable child-process controller

`createChildProcessController()` observes an existing child's exit and provides graceful termination with a forced-shutdown fallback and optional process-signal forwarding.
