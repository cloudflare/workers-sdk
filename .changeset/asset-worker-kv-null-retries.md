---
"@cloudflare/workers-shared": patch
---

Retry KV reads that return null when serving static assets, not just reads that error.

Immediately after a deploy there is a brief window where an asset referenced by the manifest may not yet have propagated to every KV storage provider, causing a read to return null. Previously this surfaced as an intermittent 500. The Asset Worker now retries these null reads (in addition to errored reads) using a jittered exponential backoff before giving up, reducing intermittent 500s in the moments following a deployment. Retried reads continue to use a short cache TTL so a transient miss is never cached long-term.
