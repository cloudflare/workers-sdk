---
"@cloudflare/autoconfig": minor
---

Report the project's Wrangler config in `getDetailsForAutoConfig`

The details now include `wranglerConfig`: the one the caller passes, or else the one in the project folder. The `wranglerConfig` option also accepts a config as written in its file.
