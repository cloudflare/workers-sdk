---
"@cloudflare/workers-utils": patch
"wrangler": patch
---

Add upgrade hint to unexpected configuration field warnings

When Wrangler encounters unexpected fields in the configuration file, it now suggests updating Wrangler as a potential solution. If an update is available, Wrangler will also display the current and latest versions to help users understand if they're behind.
