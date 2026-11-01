---
"wrangler": patch
---

Compress Wrangler-built container image layers with zstd by default to reduce layer size and improve decompression speed.

Set `WRANGLER_CONTAINER_IMAGE_COMPRESSION=gzip` to use the previous gzip behavior if needed.
