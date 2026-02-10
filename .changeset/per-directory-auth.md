---
"wrangler": minor
"@cloudflare/workers-utils": minor
---

Add per-project authentication with `wrangler login --project`

You can now store authentication tokens locally in your project directory instead of globally. This makes it easy to work with multiple Cloudflare accounts in different projects:

```bash
wrangler login --project
```

Authentication will be stored in `.wrangler/config/default.toml` in your project directory and automatically detected by all Wrangler commands.

**Features:**

- **`--project` flag**: Use `wrangler login --project` to store OAuth tokens in the local `.wrangler` directory
- **Auto-detection**: Once logged in locally, all Wrangler commands automatically use the local authentication
- **`WRANGLER_HOME` environment variable**: Customize the global config directory location
- **Priority**: Environment variables > Local auth > Global auth
- **`wrangler whoami`**: Shows whether you're using local or global authentication
- **`wrangler logout --project`**: Logout from local authentication

Aliases: `--directory` and `--local` work as aliases for `--project`.

This feature is particularly useful when working on multiple projects that need different Cloudflare accounts, or in team environments where each developer uses their own account.
