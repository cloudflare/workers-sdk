---
"@cloudflare/vite-plugin": patch
---

Filter compatibility date fallback warning when no update is available

The compatibility date warning from workerd (e.g., "The latest compatibility date supported by the installed Cloudflare Workers Runtime is...") is now only shown when a newer version of `@cloudflare/vite-plugin` is available. This matches the behavior in Wrangler and reduces noise when the user is already on the latest version.
