---
"wrangler": patch
---

Added `--tag` and `--message` flags to `wrangler deploy` command. You can now upload, deploy, and tag a Worker version in a single command:

```bash
wrangler deploy --tag v1.0.0 --message "Deployment description"
```

This provides feature parity with `wrangler versions upload` for deployments using the new versions API. For deployments using the legacy script upload API (e.g., with Durable Object migrations), the `--tag` flag is supported but stored as a service tag, and `--message` is not supported.
