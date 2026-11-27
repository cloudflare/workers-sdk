---
"@cloudflare/autoconfig": minor
---

Report the project's Wrangler config in `getDetailsForAutoConfig`

The details now include `wranglerConfigPath` when the project folder has its own Wrangler config, or when the caller passes one with a custom name.
