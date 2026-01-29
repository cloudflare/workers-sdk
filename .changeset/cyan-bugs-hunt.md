---
"wrangler": patch
---

Add `versionCommand` to the `autoconfig_summary` field in the autoconfig output entry

Add the version upload command to the output being printed by `wrangler deploy` to `WRANGLER_OUTPUT_FILE_DIRECTORY`/`WRANGLER_OUTPUT_FILE_PATH`. This complements the existing `buildCommand` and `deployCommand` fields and allows CI systems to know how to upload new versions of Workers.

For example, for a standard npm project this would be:

- Version command: `npx wrangler versions upload`

While for a Next.js project it would be:

- Version command: `npx @opennextjs/cloudflare upload`
