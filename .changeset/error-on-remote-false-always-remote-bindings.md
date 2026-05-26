---
"wrangler": patch
---

Reject `remote: false` on always-remote bindings (AI, AI Search, Media, Artifacts, Flagship, VPC Service, VPC Network)

These binding types have no local simulator and the resource is fundamentally remote-only. Setting `remote: false` was previously silently accepted but produced a non-functional binding. `wrangler dev` now fails with a clear error directing users to either remove the `remote` field or set it to `true`.
