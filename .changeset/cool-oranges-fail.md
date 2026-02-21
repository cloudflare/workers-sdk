---
"@cloudflare/vite-plugin": patch
---

Append Cloudflare defaults to existing `.assetsignore` files during build output

When a project includes a `PUBLIC_DIR/.assetsignore`, the plugin now preserves those rules and appends the required `wrangler.json` and `.dev.vars` entries instead of replacing the file content.
