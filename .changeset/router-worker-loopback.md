---
"@cloudflare/workers-shared": patch
"miniflare": patch
"@cloudflare/vite-plugin": patch
---

Prepares router-worker for a more gradual rollout by refactoring and separating out the invocation from the business logic. In the future, this will provide space for us to route requests to new versions of router-worker based on their plan, but should make no functional difference today.
