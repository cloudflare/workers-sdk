---
"wrangler": patch
---

Move temporary preview account support into the shared OAuth flow

The `--temporary` provisioning primitive and its session state now live in `@cloudflare/workers-auth` (latched on the per-CLI OAuth flow instance) so other Cloudflare CLIs can reuse it. Credential resolution, account selection, and the public-only compliance-region guard are unchanged.

`--temporary` is now strictly for unauthenticated use: if you pass it while already authenticated (via OAuth, `CLOUDFLARE_API_TOKEN`, or a global API key), Wrangler throws an error explaining the situation instead of silently ignoring the flag.
