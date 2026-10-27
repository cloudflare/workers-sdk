---
"wrangler": patch
"@cloudflare/deploy-helpers": patch
"miniflare": patch
---

Validate `.assetsignore` encoding before building asset manifests

Asset uploads and local development now stop with an actionable user error when `.assetsignore` is not valid UTF-8 or contains null characters, instead of silently losing its patterns. This also applies to standalone Miniflare and the Wrangler, Vite and Vitest development integrations. Save the file as UTF-8 to continue; UTF-8 files with a byte order mark and intentionally empty files remain supported.
