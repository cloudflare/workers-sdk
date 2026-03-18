---
"wrangler": minor
"@cloudflare/workers-utils": patch
---

Send deployment metadata with worker uploads

Wrangler now sends deployment metadata to Cloudflare when deploying workers. This metadata includes:

- Wrangler version
- Package manager used (npm, pnpm, yarn, or bun)
- Project dependencies (package names and versions from package.json)

This information helps Cloudflare understand the tools and frameworks being used to build Workers. Private packages (those with `"private": true` in their package.json) and workspace packages are excluded from the dependency list.

The metadata is sent as part of the existing worker upload API request and does not require any configuration changes.
