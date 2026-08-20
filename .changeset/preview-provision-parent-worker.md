---
"@cloudflare/deploy-helpers": minor
"wrangler": minor
---

[private beta]: Create the parent Worker automatically when `wrangler preview` targets one that doesn't exist yet

Previews hang off a parent Worker, so running `wrangler preview` before the Worker had ever been deployed failed with a raw API error naming the Preview endpoint. Wrangler now offers to create an empty parent Worker and then carries on creating the Preview. The parent uses the same workers.dev and Preview URL settings that `wrangler deploy` would resolve, without applying routes or cron triggers. In non-interactive environments, Wrangler creates the Worker without asking.
