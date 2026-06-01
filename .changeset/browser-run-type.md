---
"wrangler": patch
---

Update the generated type for browser bindings to `BrowserRun`

When running `wrangler types`, browser bindings were previously typed as the generic `Fetcher`. They now generate the more specific and accurate `BrowserRun` type.
