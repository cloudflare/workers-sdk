---
"miniflare": minor
---

Support serving videos locally, add `publicUrl` option for stable stream preview URLs, and add caption upload support via ReadableStream

Videos uploaded while in local mode are now served at `/cdn-cgi/mf/stream/<video-id>/watch`. The `preview` field in `StreamVideo` is now directly fetchable during development.

A new `publicUrl` option on `MiniflareOptions` allows callers (e.g. Wrangler, the Vite plugin) to advertise a stable, externally-reachable URL for the Miniflare instance. When set, Stream preview URLs use this value instead of the runtime entry URL, so they remain valid across runtime restarts and port changes. The same value is also exposed as a mutable `miniflare.publicUrl` property.

Caption uploads via `ReadableStream` are now supported in local mode. They no longer throw a "not supported in local mode" error.
