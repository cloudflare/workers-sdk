---
"wrangler": minor
---

feat: allow Durable Object migrations to be overridable in environments

By making the `migrations` key inheritable, users can provide different migrations
for each wrangler.toml environment.

Resolves [#729](https://github.com/cloudflare/workers-sdk/issues/729)
