---
"@cloudflare/deploy-helpers": minor
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Expand dotenv variable references in `--secrets-file` input

Dotenv files supplied through `--secrets-file` to `deploy`, `versions upload`, and `preview` now expand `$VAR` and `${VAR}` references using process values and earlier file values. Process environment values override matching file keys, including explicitly empty values.

This changes how existing dotenv secrets files are interpreted: an unset reference becomes an empty string, so `PASSWORD=pa$word` becomes `pa` when `word` is unset. Escape literal dollar signs with a backslash (`PASSWORD=pa\$word`), or use a JSON secrets file to preserve values exactly. JSON input and bulk-secret commands, including piped stdin, retain their existing literal parsing.
