---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Expand dotenv variable references in `--secrets-file` input

Dotenv secret files now match Wrangler's normal `.env` behavior: process environment values take precedence, earlier file values can be referenced, and escaped dollar signs remain literal. JSON secret files are unchanged.
