---
"wrangler": patch
---

feat: expire unused assets in `[site]` uploads

This expires any previously uploaded assets when using a Sites / `[site]` configuration. Because we currently do a full iteration of a namespace's keys when publishing, for rapidly changing sites this means that uploads get slower and slower. We can't just delete unused assets because it leads to occasional 404s on older publishes while we're publishing. So we expire previous assets while uploading new ones. The implementation/constraints of the kv api means that uploads may become slower, but should hopefully be faster overall. These optimisations also only matter for rapidly changing sites, so common usecases still have the same perf characteristics.
