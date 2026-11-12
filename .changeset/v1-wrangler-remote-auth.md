---
"@cloudflare/vite-plugin": patch
---

Keep v1 remote bindings on Wrangler authentication

Ignore the obsolete CLOUDFLARE_CF_AUTH environment flag so development and preview sessions continue using the project's Wrangler profile and configured account.
