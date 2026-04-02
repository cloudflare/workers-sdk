---
"wrangler": minor
---

feat: add `wrangler email routing` and `wrangler email sending` commands

Email Routing commands:

- `wrangler email routing list` - list zones with email routing status
- `wrangler email routing settings` - get email routing settings for a zone
- `wrangler email routing enable/disable` - enable or disable email routing
- `wrangler email routing dns get/unlock` - manage DNS records
- `wrangler email routing rules list/get/create/update/delete` - manage routing rules (use `catch-all` as the rule ID for the catch-all rule)
- `wrangler email routing addresses list/get/create/delete` - manage destination addresses

Email Sending commands:

- `wrangler email sending send` - send an email using the builder API
- `wrangler email sending send-raw` - send a raw MIME email message
- `wrangler email sending subdomains list/get/create/delete` - manage sending subdomains
- `wrangler email sending dns get` - get DNS records for a sending subdomain
