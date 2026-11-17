---
"wrangler": minor
---

Add multipart uploads to `wrangler r2 object put`

Upload large files using `wrangler r2 object put <bucket>/<key> --remote --multipart --file <file>`. Multipart uploads stream 90 MiB parts, retry transient part failures, attempt to abort incomplete uploads on failure, and verify the completed object's size and SHA-256 with a full readback.

This transport uses Wrangler's authenticated remote bindings and requires Workers preview permissions in addition to R2 access. Use `--force` to acknowledge the overwrite and Basin Catalog warning in non-interactive environments. Uploads cannot be resumed after exiting the CLI.
