---
"wrangler": patch
"miniflare": patch
"@cloudflare/vitest-pool-workers": patch
"@cloudflare/workers-utils": patch
---

Remove trailing periods from URLs in terminal output

URLs printed to the terminal with a sentence-ending period (e.g. `https://example.com/path.`) would include the period when clicked in some terminal emulators, causing 404 errors. This removes trailing periods from all URLs displayed in CLI output across wrangler, miniflare, vitest-pool-workers, and workers-utils.
