---
"@cloudflare/workers-shared": patch
"miniflare": patch
---

Implement ctx.exports loopback in the Asset Worker

Adds the loopback pattern to the Asset Worker, matching the approach used in the preview dispatcher. In production, the outer entrypoint forwards all public methods (fetch, unstable_canFetch, unstable_getByETag, unstable_getByPathname, unstable_exists) to an inner AssetWorkerEntrypoint via ctx.exports. This establishes the infrastructure for future cohort-based versioned deployments.
