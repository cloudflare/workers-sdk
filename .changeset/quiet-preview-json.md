---
"wrangler": patch
"@cloudflare/deploy-helpers": patch
---

Keep `wrangler preview --json` stdout parseable when loading redirected configs and uploading assets

The private beta preview command now suppresses informational and build-progress logs throughout its JSON-mode lifecycle, while preserving warnings and errors on stderr. Wrangler emits the preview and deployment response through its JSON logger instead of the shared preview helper's ordinary logger, so scripts can parse stdout without stripping a text preamble.
