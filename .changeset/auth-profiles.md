---
"wrangler": minor
---

Add auth profiles for managing multiple OAuth logins

Auth profiles let you maintain separate OAuth logins and bind them to directories, so you can switch between different accounts for different projects without having to re-login.

For example:

```sh
wrangler auth create work
wrangler auth activate work ~/projects/work

wrangler auth create personal
wrangler auth activate personal ~/projects/personal
```

New commands under `wrangler auth`:

- `wrangler auth create <name>` — create or re-authenticate a named profile via OAuth
- `wrangler auth delete <name>` — delete a profile and all its directory bindings
- `wrangler auth activate <name> [dir]` — bind a profile to a directory (defaults to cwd). Sub-directories will inherit this profile.
- `wrangler auth deactivate [dir]` — remove a directory binding
- `wrangler auth list` — list all profiles and their corresponding directories

There is also a new global `--profile` flag, which you can use to activate a profile for just that command run. Note that if you have `CLOUDFLARE_API_TOKEN` set, that will still take precedence over all profiles. Any account id settings (via `CLOUDFLARE_ACCOUNT_ID` or wrangler config) will also still be respected.
