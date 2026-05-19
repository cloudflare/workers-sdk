---
"wrangler": minor
---

Add authentication profiles to Wrangler

Profiles store separate OAuth credentials so you can switch between accounts without reauthenticating.

Create a profile and log in:

`wrangler profiles create "work"`

This will direct you through the usual OAuth flow, where you can choose to limit which accounts this OAuth token will have access to.

To switch between profiles, run:

`wrangler profiles set "personal"`

Bind a profile to a directory so it activates automatically:

`wrangler profiles set "work" --dir="/path/to/project"`

You can also override the active profile with the `WRANGLER_PROFILE` environment variable.

These commands are also provided:

- `wrangler profiles list`
- `wrangler profiles delete` (revokes the token)
- `wrangler profiles unset` (unbinds a specific directory, or stop using profiles)
