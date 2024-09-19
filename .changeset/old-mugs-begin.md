---
"wrangler": patch
---

fix: disable observability on deploy if not explicitly defined in config

When deploying a Worker that has observability enabled in the deployed version but not specified in the `wrangler.toml` Wrangler will now set observability to disabled for the new version to match the `wrangler.toml` as the source of truth.
