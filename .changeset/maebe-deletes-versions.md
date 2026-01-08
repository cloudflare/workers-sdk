---
"wrangler": minor
---

Add `wrangler versions delete` command

You can now delete Worker versions that were uploaded but not deployed:

```bash
wrangler versions delete <version-id> --name my-worker
```

This is useful for cleaning up unused versions created via `wrangler versions upload`.
