---
"@cloudflare/containers-shared": patch
---

When returning the default managed registry, inspect the environment variable
`WRANGLER_API_ENVIRONMENT` to determine if we should be returning the production
or staging registry.
