---
"wrangler": minor
---

Add `wrangler auth token` command to retrieve your current authentication credentials.

You can now retrieve your authentication token for use with other tools and scripts:

```bash
wrangler auth token
```

The command returns whichever authentication method is currently configured:

- OAuth token from `wrangler login` (automatically refreshed if expired)
- API token from `CLOUDFLARE_API_TOKEN` environment variable

Use `--json` to get structured output including the token type, which also supports API key/email authentication:

```bash
wrangler auth token --json
```

This is similar to `gh auth token` in the GitHub CLI.
