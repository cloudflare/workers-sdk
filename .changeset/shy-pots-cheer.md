---
"@cloudflare/vitest-pool-workers": patch
---

Fix container build ID generation when containers are present

Generate container build ID when containers are defined in wrangler config, resolving "Build ID should be set if containers are defined and enabled" assertion error during testing.
