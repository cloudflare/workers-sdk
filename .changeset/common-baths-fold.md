---
"@cloudflare/vite-plugin": patch
---

Set the `x-forwarded-host` header to the original host in requests. This fixes a bug where libraries such as Clerk would redirect to the workerd host rather than the Vite host.
