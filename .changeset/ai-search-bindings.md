---
"wrangler": minor
"miniflare": minor
"@cloudflare/workers-utils": minor
---

feat: Add `ai_search_namespaces` and `ai_search` binding types

Two new binding types for AI Search:

- `ai_search_namespaces`: Namespace binding — `namespace` is required and auto-provisioned at deploy time if it doesn't exist (like R2 buckets)
- `ai_search`: Single instance binding bound directly to a pre-existing instance in the default namespace

Both are remote-only in local dev.
