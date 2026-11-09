---
"create-cloudflare": patch
"@cloudflare/autoconfig": patch
"wrangler": patch
---

Fix JavaScript configuration parsing for Svelte projects using object spread

Use a parser that supports object spread when updating JavaScript configuration files. This prevents configuration failures for Svelte projects using Drizzle or Better Auth and other framework configurations containing modern JavaScript syntax.

Vite autoconfiguration reports a configuration error when an object spread, computed property, or accessor after the plugins array could override the Cloudflare plugin. Place the effective plugins array after these properties before retrying autoconfiguration.
