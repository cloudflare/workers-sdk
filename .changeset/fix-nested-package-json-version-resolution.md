---
"@cloudflare/codemods": patch
"@cloudflare/workers-utils": patch
"wrangler": patch
---

Fix packages with nested `package.json` files missing from deploy metadata

Packages such as `hono`, `stripe` and `@modelcontextprotocol/sdk` were silently omitted from the package dependency metadata reported during `wrangler deploy` and `wrangler versions upload`. These packages are now included with their installed versions. Autoconfig and codemods also detect their installed versions correctly.
