---
"@cloudflare/build-output-utils": minor
"@cloudflare/vite-plugin": minor
"@cloudflare/config": minor
"wrangler": minor
---

Record the selected mode in the Build Output Specification top-level `config.json`

The mode a build was produced in is now written to `.cloudflare/output/v0/config.json` as a `mode` field, alongside the account and compliance settings.
