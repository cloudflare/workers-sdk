---
"@cloudflare/vite-plugin": patch
---

Ignore `.wrangler` persistence writes in Vite's file watcher

Miniflare stores local D1, KV, R2, and observability state under `.wrangler/state`. Those writes were watched as source changes on Linux and Windows, which fired every plugin `hotUpdate` hook and could make page loads take seconds. The plugin now ignores `**/.wrangler/**` while preserving any `server.watch.ignored` patterns already set by the user.
