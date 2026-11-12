---
"wrangler": patch
---

Fix requests hanging when a local Worker reload finishes before an inflight request fails

Wrangler now immediately processes retriable requests when the replacement Worker is already ready. Previously, these requests could remain queued until another request arrived, particularly on Windows where connection failures can take longer to report.
