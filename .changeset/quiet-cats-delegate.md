---
"@cloudflare/autoconfig": minor
---

Resolve canonical framework build commands for the `cf` target

Autoconfig now returns framework commands instead of package scripts for `cf`, including framework-specific overrides such as OpenNext. Wrangler's existing package-script detection remains unchanged.
