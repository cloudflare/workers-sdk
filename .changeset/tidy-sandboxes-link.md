---
"wrangler": minor
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
---

Allow experimental Durable Object-managed Containers to link by name through exports

Containers using `scheduling_policy: "durable_object"` can now specify `name` and link from `exports.<Class>.container` without repeating `class_name`. Deploy and version upload resolve that link for image preparation, Worker metadata, and Container application creation.
