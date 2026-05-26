---
"wrangler": minor
---

Add authentication profiles to Wrangler

Profiles allow you to store multiple sets of OAuth credentials against specific directories, allowing you to switch between accounts without reauthenticating.

Create a profile:

`wrangler profiles create "work"`

This will direct you through the usual OAuth flow, where you can choose to limit which accounts this OAuth token will have access to.

Activate a profile for the current working directory:

`wrangler login --profile="work"`

Unbind the current working directory from a profile:

`wrangler logout --profile="work"`

You can also override the active profile with the `WRANGLER_PROFILE` environment variable.

These commands are also provided:

- `wrangler profiles list`
- `wrangler profiles delete` (revokes the token and removes all directory bindings)
