---
"wrangler": patch
---

Log a helpful error message when AI binding requests fail with a 403 authentication error

Previously, when the AI proxy token expired during a long session, users received an unhelpful 403 error. Now, wrangler detects error code 1031 and suggests running `wrangler login` to refresh the token.
