---
"wrangler": minor
---

feat: add `--secrets-file` parameter to `wrangler versions upload`

You can now upload secrets alongside your Worker code in a single operation using the `--secrets-file` parameter. The file format matches what's used by `wrangler versions secret bulk`, supporting both JSON and .env formats.

Example usage:

```bash
wrangler versions upload --secrets-file .env.production
wrangler versions upload --secrets-file secrets.json
```

Secrets not included in the file will be inherited from the previous version, matching the behavior of `wrangler versions secret bulk`.
