---
"wrangler": patch
---

Skip unnecessary `GET /versions?deployable=true` API call in `wrangler versions deploy` when all version IDs are explicitly provided and `--yes` is passed

When deploying a specific version non-interactively (e.g. `wrangler versions deploy <id> --yes`), Wrangler previously always fetched the full list of deployable versions to populate the interactive selection prompt — even though the prompt is skipped entirely when `--yes` is used and all versions are already specified. The deployable-versions list is now only fetched when actually needed (i.e. when no version IDs are provided, or when running interactively).
