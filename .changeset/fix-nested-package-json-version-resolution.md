---
"@cloudflare/workers-utils": patch
---

Fix packages with nested `package.json` files missing from deploy metadata

Some packages, such as `hono`, `stripe` and `@modelcontextprotocol/sdk`, ship a nested `package.json` next to their CommonJS entry point that only sets `"type": "commonjs"`. Version detection read that file instead of the package's root manifest, found no version, and the package was silently omitted from the package dependency metadata reported during `wrangler deploy` and `wrangler versions upload`. Version detection now skips manifests without a `name` and continues to the package root.
