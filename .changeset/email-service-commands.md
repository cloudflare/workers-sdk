---
"wrangler": minor
---

feat: add `wrangler email routing` and `wrangler email sending` commands

Email Routing commands:

- `wrangler email routing list` - list zones with email routing status
- `wrangler email routing settings <domain>` - get email routing settings for a zone
- `wrangler email routing enable/disable <domain>` - enable or disable email routing
- `wrangler email routing dns get/unlock <domain>` - manage DNS records
- `wrangler email routing rules list/get/create/update/delete <domain>` - manage routing rules (use `catch-all` as the rule ID for the catch-all rule)
- `wrangler email routing addresses list/get/create/delete` - manage destination addresses

Email Sending commands:

- `wrangler email sending list` - list zones with email sending
- `wrangler email sending settings <domain>` - get email sending settings for a zone
- `wrangler email sending enable <domain>` - enable email sending for a zone or subdomain
- `wrangler email sending disable <domain>` - disable email sending for a zone or subdomain
- `wrangler email sending dns get <domain>` - get DNS records for a sending domain
- `wrangler email sending send` - send an email using the builder API
- `wrangler email sending send-raw` - send a raw MIME email message

Also adds `email_routing:write` and `email_sending:write` OAuth scopes to `wrangler login`.
