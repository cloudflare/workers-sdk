---
"wrangler": patch
---

Improve the `wrangler deploy` flow to also check for potential overrides of [secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

Now when you run `wrangler deploy` Wrangler will check the remote secrets for your workers for conflicts with the names of the bindings you're about to deploy. If there are conflicts, Wrangler will warn you and ask you for your permission before proceeding.
