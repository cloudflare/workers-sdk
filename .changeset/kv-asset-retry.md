---
"@cloudflare/workers-shared": patch
---

Retry asset reads from KV when they fail

The asset worker reads static assets from KV, and a read can occasionally fail with a transient error. It previously retried only once before giving up. It now retries a few times with exponential backoff, which reduces the chance of serving an error. A missing asset is not treated as a failure and is not retried.
