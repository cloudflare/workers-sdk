---
"wrangler": patch
---

feat: implement `[text_blobs]`

This implements support for `[text_blobs]` as defined by https://github.com/cloudflare/wrangler/pull/1677.

Text blobs can be defined in service-worker format with configuration in `wrangler.toml` as -

```
[text_blobs]
MYTEXT = "./path/to/my-text.file"
```

The content of the file will then be available as the global `MYTEXT` inside your code. Note that this ONLY makes sense in service-worker format workers (for now).

Workers Sites now uses `[text_blobs]` internally. Previously, we were inlining the asset manifest into the worker itself, but we now attach the asset manifest to the uploaded worker. I also added an additional example of Workers Sites with a modules format worker.
