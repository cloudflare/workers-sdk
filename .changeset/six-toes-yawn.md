---
"wrangler": minor
---

feat: teach `wrangler docs` to use algolia search index

This PR lets you search Cloudflare's entire docs via `wrangler docs [search term here]`.

By default, if the search fails to find what you're looking for, you'll get an error like this:

```
✘ [ERROR] Could not find docs for: <search term goes here>. Please try again with another search term.
```

If you provide the `--yes` or `-y` flag, wrangler will open the docs to https://developers.cloudflare.com/workers/wrangler/commands/, even if the search fails.
