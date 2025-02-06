---
"create-cloudflare": minor
"wrangler": patch
---

Remove Bun support

This adds an error message to Wrangler when Wrangler is started using Bun. Wrangler has never supported Bun, and so this surfaces that lack of support earlier. Additionally, we've removed Bun support from create-cloudflare.
