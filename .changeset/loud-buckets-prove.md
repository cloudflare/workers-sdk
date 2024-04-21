---
"create-cloudflare": minor
---

feat: Improvements to `hono` template.

The `hono` template has been updated as follows:

- Bumps `create-hono` to `0.7.0`
- Automatically installs dependencies and specifies the detected package manager to avoid interactive prompts
- Adds a `wrangler.toml` file with commented out examples of all available bindings to match other templates.
- Adds a `cf-typegen` package script to automatically regenerate types for `Bindings` from `wrangler.toml`
-
