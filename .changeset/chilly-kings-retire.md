---
"create-cloudflare": patch
---

Fix regression in C3's `next` template

[#7676](https://github.com/cloudflare/workers-sdk/pull/7676) switched C3 templates to default to `wrangler.json` instead of `wrangler.toml`. Unfortunately, this unintendedly broke the `next` template, which was still attempting to read `wrangler.toml` specifically. This commit fixes the regression.

Fixes #7770
