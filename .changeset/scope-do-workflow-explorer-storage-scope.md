---
"miniflare": patch
---

Scope Durable Object and Workflow local explorer peers by storageScope

Restricts Durable Object and Workflow peer discovery and owner resolution to Miniflare peers sharing the same storageScope when Shared Storage is enabled. This ensures consistency with KV, D1, and R2 local explorer behaviors and prevents cross-project access to local development state across instances with different persistence roots.
