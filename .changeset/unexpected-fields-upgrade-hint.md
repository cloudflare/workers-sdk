---
"@cloudflare/workers-utils": patch
"wrangler": patch
---

Add upgrade hint to unexpected configuration field warnings

When Wrangler encounters unexpected fields in the configuration file, it now suggests updating Wrangler as a potential solution. This helps users who may be using configuration options that were added in a newer version of Wrangler.
