---
"wrangler": patch
---

Fix `wrangler email sending` commands

The `email sending` commands previously failed against the Cloudflare API. They now work as expected:

- `email sending enable <domain>` enables Email Sending for a domain
- `email sending disable <domain>` disables Email Sending for a domain
- `email sending settings <domain>` shows the Email Sending configuration for a domain
- `email sending dns get <domain>` shows the DNS records to set up for a domain
- `email sending list` previously listed zones. It now lists the domains that have Email Sending enabled — every enabled domain across your account by default, or just those under a specific domain when you pass a domain (or `--zone-id`).
