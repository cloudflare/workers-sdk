---
"wrangler": patch
---

Added `--tag` and `--message` flags to `wrangler deploy` command. You can now upload, deploy, and tag a Worker version in a single command:

```bash
wrangler deploy --tag v1.0.0 --message "Deployment description"
```

This provides feature parity with `wrangler versions upload` and eliminates the need for a two-step process.
