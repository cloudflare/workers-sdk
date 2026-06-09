---
"wrangler": minor
---

Fix `wrangler email sending` commands to use the correct API endpoints

The `email sending` commands targeted API endpoints that do not exist (e.g. `/zones/{id}/email/sending/enable`, `/zones/{id}/email/sending/disable`, `/zones/{id}/email/sending` and `/zones/{id}/email/sending/dns`), so they failed against the real API.

Email Sending is managed through sending subdomains, so these commands now use the correct endpoints:

- `email sending enable <domain>` creates a sending subdomain (`POST /zones/{id}/email/sending/subdomains`)
- `email sending disable <domain>` deletes the sending subdomain (`DELETE /zones/{id}/email/sending/subdomains/{tag}`)
- `email sending settings <domain>` reads a single sending subdomain (`GET /zones/{id}/email/sending/subdomains/{tag}`)
- `email sending dns get <domain>` always reads the subdomain's DNS records (`GET /zones/{id}/email/sending/subdomains/{tag}/dns`)
- `email sending list` now lists sending subdomains: all subdomains across the account by default, or a single zone's subdomains when a domain or `--zone-id` is given
