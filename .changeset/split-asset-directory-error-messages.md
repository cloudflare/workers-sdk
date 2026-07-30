---
"@cloudflare/pages-functions": minor
---

Improve asset directory error messages in Pages Functions builds

Previously, when an imported asset directory was invalid, a single error message was shown: `'<path>' does not exist or is not a directory`. This has been split into two distinct, actionable messages:

- `'<path>' does not exist. Please create the directory or check the path and try again.`
- `'<path>' is not a directory. Please provide a path to a valid directory.`
