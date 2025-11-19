---
"@cloudflare/workers-utils": patch
---

Fix `mapWorkerMetadataBindings` and `constructWranglerConfig` incorrectly throwing an error when encountering assets bindings

Currently `mapWorkerMetadataBindings` and `constructWranglerConfig` when provided data containing an assets binding throw the
following error:

```
 the error "`wrangler init --from-dash` is not yet supported for Workers with Assets"
```

This is incorrect and `wrangler init` specific, the changes here make sure that such error is not thrown and that the assets
binding is instead handled
