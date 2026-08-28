---
"@cloudflare/autoconfig": minor
---

Resolve canonical framework build commands for the `cf` target

Autoconfig now returns framework commands instead of package scripts for `cf`. Generated deploy scripts delegate build selection to `cf deploy`. Wrangler's existing package-script detection remains unchanged.
