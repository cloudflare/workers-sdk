---
"wrangler": patch
---

Preserve all deployment-affecting CLI flags in the interactive deploy config flow

When running `wrangler deploy` without a config file and going through the interactive setup flow, CLI flags beyond `--compatibility-flags` (such as `--routes`/`--route`, `--domains`/`--domain`, `--triggers`, `--var`, `--define`, `--alias`, `--jsx-factory`, `--jsx-fragment`, `--tsconfig`, `--minify`, `--upload-source-maps`, `--no-bundle`, `--logpush`, `--keep-vars`, `--legacy-env`, and `--dispatch-namespace`) were silently dropped. These flags are now persisted to the generated `wrangler.jsonc` config file (where a config field equivalent exists) and included in the suggested CLI command when the user declines config file generation.
