---
"wrangler": minor
---

The `CLOUDFLARE_CF` environment variable can now be used to provide a custom path for caching CF objects during local development. When set to a string, this path will be passed to miniflare's `cf` option for fetching and caching real CF objects, providing more control over CF object handling in local development.
