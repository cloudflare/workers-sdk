---
"@cloudflare/deploy-helpers": minor
"wrangler": minor
---

[private beta]: Add `--secrets-file` and `--var` flags to `wrangler preview`

Like `wrangler deploy` and `wrangler versions upload`, `wrangler preview` now accepts a `--secrets-file` flag pointing to a JSON or .env format file, and `--var KEY:VALUE` pairs that are injected into the Preview deployment as plain text variables. CLI vars override same-named vars from the `previews` section of your config file, and secrets from the file take precedence over both:

`wrangler preview --secrets-file .env.preview --var API_URL:https://api.example.com`
