---
"miniflare": minor
---

Support serving videos locally and add support for caption and watermark uploads via ReadableStream

Videos uploaded while in local mode are now served at `/cdn-cgi/stream/<video-id>/video.mp4`. The `preview` field in `StreamVideo` is now directly fetchable during development.

Caption and watermark uploads via `ReadableStream` are now fully supported in local mode. They no longer throw a "not supported in local mode" error.
