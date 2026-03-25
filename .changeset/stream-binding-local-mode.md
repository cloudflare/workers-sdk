---
"miniflare": minor
"wrangler": minor
---

Add local mode support for Stream bindings

Miniflare and `wrangler dev` now support using [Cloudflare Stream](https://developers.cloudflare.com/stream/) bindings locally.

Supported operations:

- `upload()` — upload video via URL
- `video(id).details()`, `.update()`, `.delete()`, `.generateToken()`
- `videos.list()`
- `captions.generate()`, `.list()`, `.delete()`
- `downloads.generate()`, `.get()`, `.delete()`
- `watermarks.generate()`, `.list()`, `.get()`, `.delete()`

The following are not yet supported in local mode and will throw:

- `createDirectUpload()`
- Caption upload via `File`
- Watermark generation via `File`

Data is persisted across restarts by default. You must set `streamPersist: false` in Miniflare options to disable persistence.
