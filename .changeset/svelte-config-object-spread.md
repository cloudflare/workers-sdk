---
"create-cloudflare": patch
"@cloudflare/autoconfig": patch
"wrangler": patch
---

Fix JavaScript configuration parsing for Svelte projects using object spread

Use a parser that supports object spread when updating JavaScript configuration files. This prevents configuration failures for Svelte projects using Drizzle or Better Auth and other framework configurations containing modern JavaScript syntax.
