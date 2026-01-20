---
"wrangler": patch
---

Fix false positive infinite loop detection for exact path redirects

Fixed an issue where the redirect validation incorrectly flagged exact path redirects like `/ /index.html 200` as infinite loops. This was particularly problematic when `html_handling` is set to "none", where such redirects are valid.

The fix makes the validation more specific to only block wildcard patterns (like `/* /index.html`) that would actually cause infinite loops, while allowing exact path matches that are valid in certain configurations.

Fixes: https://github.com/cloudflare/workers-sdk/issues/11824
