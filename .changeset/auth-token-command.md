---
"wrangler": minor
---

Add `wrangler auth token` command to retrieve the current OAuth token, refreshing it if necessary.

You can now retrieve your authentication token for use with other tools and scripts:

```bash
wrangler auth token
```

This is similar to `gh auth token` in the GitHub CLI and allows you to easily retrieve your authentication token without having to manually locate the config file or handle token refresh.
