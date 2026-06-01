---
"wrangler": patch
---

Fix `wrangler secret bulk` dropping newlines from `.env` input read from stdin

Previously, `.env` input piped through stdin was concatenated without line breaks, so only the first secret could be parsed correctly. Stdin input now preserves line separators before parsing.
