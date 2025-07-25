---
"@cloudflare/vite-plugin": patch
---

Add `worker` to the default conditions for resolving packages

This makes it consistent with the conditions used when bundling Worker code with Wrangler.
