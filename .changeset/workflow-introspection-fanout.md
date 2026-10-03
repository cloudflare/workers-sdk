---
"@cloudflare/workflows-shared": patch
"miniflare": patch
"@cloudflare/vitest-plugin": patch
---

Avoid opening mutation resources during read-only Workflow inspection

Listing Workflow instances and disposing an unused introspector now avoid opening per-instance modifiers. Cleanup processes recorded instances with bounded concurrency, reducing resource spikes in local tests while still attempting every abort.
