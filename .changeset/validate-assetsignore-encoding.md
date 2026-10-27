---
"wrangler": patch
"@cloudflare/deploy-helpers": patch
---

Validate `.assetsignore` encoding before building asset manifests

Asset uploads now stop with an actionable error when `.assetsignore` is not valid UTF-8 or contains null characters, instead of silently losing its patterns. Save the file as UTF-8 to continue; UTF-8 files with a byte order mark and intentionally empty files remain supported.
