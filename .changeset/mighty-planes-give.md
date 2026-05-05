---
"wrangler": patch
---
Fix multi-environment warning when CLOUDFLARE_ENV is set

Commands that warn when multiple environments are configured but none is specified (e.g. `wrangler deploy`, `wrangler secret put`) were not accounting for the `CLOUDFLARE_ENV` environment variable when deciding whether to show the warning. This caused a misleading warning to appear even when the target environment was correctly specified via `CLOUDFLARE_ENV`.
