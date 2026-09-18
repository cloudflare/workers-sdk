---
"@cloudflare/build-output-utils": minor
"@cloudflare/config": minor
"@cloudflare/vite-plugin": minor
"wrangler": minor
---

Identify experimental Build Output resource configs by filename and location

The root remains `config.json`, Worker configs are now `worker.config.json`, and Container configs are now `container.config.json`. Resource configs no longer contain top-level `type` discriminators, while settings and build context are stored together in the root config.
