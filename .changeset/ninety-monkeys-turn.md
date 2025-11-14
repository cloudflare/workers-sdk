---
"create-cloudflare": minor
---

When the `--experimental` flag is passed to `create-cloudflare`, use `wrangler setup` for configuring a project to work on Cloudflare rather than the existing `create-cloudflare` logic. Only Gatsby is supported right now, with more frameworks to be added in future. There should be no functional change to applications created via `create-cloudflare` when using the `--experimental` flag.
