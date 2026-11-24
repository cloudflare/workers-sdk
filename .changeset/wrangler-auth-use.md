---
"wrangler": minor
---

Add `wrangler auth use <name>` (alias: `wrangler auth switch`) to switch the globally active auth profile

Named auth profiles could previously only be selected per directory (`wrangler auth activate`), per invocation (`--profile`), or per shell (`CLOUDFLARE_AUTH_PROFILE`). `wrangler auth use <name>` now sets a user-level active profile that applies everywhere none of those more specific selections do, so you can log in to several Cloudflare accounts with `wrangler auth create <name>` and switch between them from any directory.

- `wrangler auth use <name>` switches to a named profile; `wrangler auth use default` switches back to the default profile. Run it with no argument for an interactive picker.
- `wrangler auth list` now marks the profile in use for the current directory, the global active profile, and reports where the current selection came from.
- `wrangler auth delete` clears the global switch when the deleted profile was the active one, and `wrangler auth deactivate` falls back to the global active profile before the default.

Resolution order is now: `--profile` → `CLOUDFLARE_AUTH_PROFILE` → directory binding → global active profile → `default`.
