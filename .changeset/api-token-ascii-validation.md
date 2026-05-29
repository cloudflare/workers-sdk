---
"wrangler": patch
---

Fix cryptic "Cannot convert argument to a ByteString" error when API token contains non-ASCII characters

Previously, if `CLOUDFLARE_API_TOKEN` contained non-ASCII characters (for example an ellipsis `…` instead of three dots `...`, which can happen when copy-pasting tokens from some web pages or terminals that auto-substitute punctuation), wrangler would crash with an opaque undici internal error that gave no hint that the token itself was the problem. Wrangler now detects this case in `requireApiToken()` and throws a clear `UserError` explaining the problem and how to fix it.
