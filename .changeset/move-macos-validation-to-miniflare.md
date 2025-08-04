---
"miniflare": major
"wrangler": patch
"create-cloudflare": patch
"@cloudflare/cli": patch
---

Move macOS version validation from @cloudflare/cli to miniflare

BREAKING CHANGE: Miniflare constructor now throws an error when running on unsupported macOS versions (below 13.5) instead of just logging a warning. This ensures that users get immediate feedback if their system cannot run the Workers runtime.

- **miniflare**: Constructor now validates macOS version and throws error on unsupported versions
- **wrangler**: Updated to use `warnMacOSVersion` from miniflare (warns but doesn't fail)  
- **create-cloudflare**: Updated to use `warnMacOSVersion` from miniflare (warns but doesn't fail)
- **@cloudflare/cli**: Removed macOS validation logic (moved to miniflare)

Both Wrangler and C3 now warn users about unsupported macOS versions but continue execution, while Miniflare fails fast to prevent runtime issues.
