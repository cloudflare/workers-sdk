---
"wrangler": patch
---

Improve D1 database limit error message to match Cloudflare dashboard

When attempting to create a D1 database after reaching your account's limit, the CLI now shows a more helpful error message with actionable guidance instead of the raw API error.

The new message includes:

- A clear explanation that the account limit has been reached
- A link to D1 documentation
- Commands to list and delete databases
