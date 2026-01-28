---
"wrangler": minor
---

Add multi-account profile support, allowing users to be logged into multiple Cloudflare accounts simultaneously and switch between them.

New commands:
- `wrangler login --profile <name>` - Login to a named profile
- `wrangler profile list` - List all authentication profiles
- `wrangler profile use <name>` - Switch the active profile
- `wrangler profile delete <name>` - Delete a profile
- `--profile <name>` global flag to use a specific profile for any command
- `WRANGLER_PROFILE` environment variable support

Profiles are stored as separate TOML files under `~/.wrangler/config/profiles/`. The default profile remains at the existing `~/.wrangler/config/default.toml` path for full backward compatibility.
