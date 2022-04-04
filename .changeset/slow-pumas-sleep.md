---
"wrangler": patch
---

feat: implement `[data_blobs]`

This implements `[data_blobs]` support for service-worker workers, as well as enabling Data module support for service-worker workers. `data_blob` is a supported binding type, but we never implemented support for it in v1. This implements support, and utilises it for supporting Data modules in service worker format. Implementation wise, it's incredibly similar to how we implemented `text_blobs`, with relevant changes.

Partial fix for https://github.com/cloudflare/wrangler2/issues/740 pending local mode support.
