---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Explain how to enable Preview URLs when a Preview deployment has none

`wrangler preview` now shows URL shapes and configuration snippets for Workers.dev and custom domains. The custom domain snippet preserves every configured route, and the guidance distinguishes missing settings from disabled ones.

This changes a private beta feature. The warning also makes clear that `wrangler deploy` publishes code from the current checkout.
