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
- **`WRANGLER_AUTH_TYPE=global` environment variable**: Force all commands to use global auth instead of local
  - Example: `WRANGLER_AUTH_TYPE=global wrangler kv namespace list`
  - Useful when you have local auth but need to temporarily use global auth
- **Priority**: Environment variables (API tokens) > `WRANGLER_AUTH_TYPE=global` > Local auth > Global auth
- **`wrangler whoami`**: Shows whether you're using local or global authentication
- **`wrangler logout --project`**: Logout from local authentication

**Aliases:** `--directory` and `--local` work as aliases for `--project`.

**Example workflow:**

```bash
# Login to global auth (default behavior)
wrangler login

# In project A, login with a different account
cd ~/project-a
wrangler login --project

# In project B, login with yet another account
cd ~/project-b
wrangler login --project

# Now each project automatically uses its own auth
cd ~/project-a
wrangler whoami  # Shows project A's account

cd ~/project-b
wrangler whoami  # Shows project B's account

# Force using global auth in project A
cd ~/project-a
WRANGLER_AUTH_TYPE=global wrangler whoami  # Shows global account
```

This feature is particularly useful when working on multiple projects that need different Cloudflare accounts, or in team environments where each developer uses their own account.
