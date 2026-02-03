---
"@cloudflare/workers-utils": patch
"wrangler": patch
---

Preserve Containers configuration when using `versions` commands

Previously, commands like `wrangler versions upload` would inadvertently disable Containers on associated Durable Object namespaces because the `containers` property was being omitted from the API request body.
