---
"wrangler": patch
---

Fix error messages to correctly display `wrangler.jsonc` instead of `wrangler.json` when using a `.jsonc` config file.

When users had a `wrangler.jsonc` configuration file, error messages would incorrectly reference `wrangler.json`, causing confusion. For example, a D1 error would say:

```
✘ [ERROR] Couldn't find a D1 DB with the name or binding 'staging' in your wrangler.json file.
```

even when the user's config file was actually named `wrangler.jsonc`. This has been fixed to show the correct filename based on the actual file extension.
