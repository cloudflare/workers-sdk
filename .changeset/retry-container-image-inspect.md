---
"@cloudflare/containers-shared": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
"wrangler": patch
---

Retry local Container image inspection when a newly built or tagged image is temporarily unavailable

Local Container development now waits for Docker to make the final development image tag available, avoiding transient missing-image failures during startup and rebuilds.
