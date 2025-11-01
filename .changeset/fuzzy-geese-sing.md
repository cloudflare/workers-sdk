---
"@cloudflare/vite-plugin": patch
---

Switch all instances of `miniflare.getWorker()` followed by `worker.fetch()` to use `miniflare.dispatchFetch()`. This means that the Vite plugin now emulates Cloudflare's response encoding in the same way as Wrangler.
