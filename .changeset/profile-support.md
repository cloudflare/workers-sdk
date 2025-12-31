---
"wrangler": minor
---

Add profile support for multi-account management.

Profiles allow you to store and switch between multiple Cloudflare user identities (OAuth tokens or API tokens), enabling seamless work across different Cloudflare accounts without re-authenticating.

## New Commands

- `wrangler profile list` - List all configured profiles
- `wrangler profile current` - Show the currently active profile
- `wrangler profile use <name>` - Set the project-level profile
- `wrangler profile use <name> --global` - Set the global profile
- `wrangler profile use --clear` - Clear the project-level profile
- `wrangler profile delete <name>` - Delete a profile

## Updated Commands

- `wrangler login --profile <name>` - Login and save credentials to a specific profile
- `wrangler auth token --profile <name>` - Get token from a specific profile
- `wrangler whoami` - Now shows the active profile

## File Locations

- Credentials file: `~/.wrangler/credentials` (stores all profiles)
- Global current profile: `~/.wrangler/current-profile`
- Project-level profile: `.wrangler/profile`

## Profile Resolution Precedence

1. `--profile` CLI flag (highest)
2. `WRANGLER_PROFILE` environment variable
3. `.wrangler/profile` (project-level)
4. `~/.wrangler/current-profile` (global)
5. `default` profile

## Example Workflow

```bash
# One-time setup for multiple clients
wrangler login --profile client-a
wrangler login --profile client-b

# Per-project profile (one-time per project)
cd ~/projects/client-a-worker
wrangler profile use client-a

cd ~/projects/client-b-worker
wrangler profile use client-b

# Daily workflow - just works
cd ~/projects/client-a-worker && wrangler deploy
cd ~/projects/client-b-worker && wrangler deploy
```

## Migration

Existing credentials in `~/.wrangler/config/default.toml` are automatically migrated to the new credentials file as the `default` profile.
