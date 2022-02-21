---
"wrangler": patch
---

feat: `--legacy-env` cli arg / `legacy_env` config

This is the first of a few changes to codify how we do environments in wrangler2, both older legacy style environments, and newer service environments. Here, we add a cli arg and a config field for specifying whether to enable/disable legacy style environments, and pass it on to dev/publish commands. We also fix how we were generating kv namespaces for Workers Sites, among other smaller fixes.
