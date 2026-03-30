---
"miniflare": patch
"wrangler": patch
---

fix: avoid "expected non-null body source" error on 401 responses with a request body

`undici.fetch()` implements the Fetch spec's 401 credential-retry path, which throws `TypeError: fetch failed` with cause `"expected non-null body source"` whenever a request has a `ReadableStream` body and the server responds with HTTP 401. This affected `Miniflare#dispatchFetch()`, `unstable_startWorker().fetch()`, and the internal Cloudflare API client used by Wrangler.

The fix replaces `undici.fetch()` with `undici.request()` at the affected call sites. `undici.request()` uses the Dispatcher API directly and does not implement the Fetch spec credential-retry path, so the crash cannot occur. The wrapper explicitly replicates the behaviours of `undici.fetch()` that callers rely on: `Accept`/`Accept-Encoding` default headers, transparent decompression of gzip/deflate/brotli responses, redirect following (honouring the `redirect` mode), and correct handling of multiple `set-cookie` headers.

The workspace-level `pnpm` patch for `undici@7.24.4` that was previously used as a workaround has been removed.
