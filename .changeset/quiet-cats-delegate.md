---
"@cloudflare/autoconfig": minor
---

Resolve canonical framework build commands for the `cf` target

Autoconfig now returns framework commands instead of package scripts for `cf`, including framework-specific overrides such as OpenNext. Framework adapters can also define their own configuration readiness files, allowing incomplete setup to be repaired without overwriting an existing `cloudflare.config.ts`. Wrangler's existing package-script detection remains unchanged.
