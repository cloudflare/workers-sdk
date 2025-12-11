---
"@cloudflare/vite-plugin": minor
---

Add a check to vite-plugin that ensures that the version of Wrangler being used internally is correct

In some pnpm setups it is possible for a different peer dependency version of Wrangler to leak and override the version that we require internally.
