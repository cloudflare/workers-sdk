---
"wrangler": minor
"@cloudflare/workers-utils": patch
---

Add `--allowed-mail` to the experimental `wrangler tunnel quick-start` command

The option forwards exact email addresses, comma-separated lists, and wildcard domains to `cloudflared`. It can be specified more than once to combine multiple recipient rules.

Email-protected tunnels require `cloudflared` 2026.9.2 or later. Wrangler checks the selected binary before starting the tunnel and reports an upgrade error when it is incompatible.
