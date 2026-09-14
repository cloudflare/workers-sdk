---
"wrangler": minor
"@cloudflare/workers-utils": patch
---

Add `--allowed-mail` to the experimental `wrangler tunnel quick-start` command

The option forwards exact email addresses, comma-separated lists, and wildcard domains to `cloudflared`. It can be specified more than once to combine multiple recipient rules.
