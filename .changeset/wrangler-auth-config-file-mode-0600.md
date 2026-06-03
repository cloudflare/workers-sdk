---
"wrangler": patch
"@cloudflare/workers-auth": patch
---

Tighten on-disk permissions of the OAuth credentials file to `0600`

The user auth config file written by `wrangler login` (typically `~/.config/.wrangler/config/default.toml` on Linux/macOS, or `<environment>.toml` for non-production Cloudflare API environments) is now written with mode `0600` and re-`chmod`-ed on every save. This prevents other local users on shared hosts from reading the stored OAuth tokens. Existing files with looser permissions written by older Wrangler versions are tightened the next time Wrangler refreshes the token or the user logs in again. The change is a no-op on Windows, which does not honour POSIX mode bits.
