---
"wrangler": patch
---

Fix `wrangler types --check` ignoring `--env-interface` and secondary `--config` entries

Previously, `wrangler types --check` ran its staleness check before resolving the `--env-interface` flag and before collecting secondary worker entry points from additional `--config` arguments. This meant it could incorrectly report types as up to date when they were actually stale due to a different env interface name or changes in secondary worker configs. The check now runs after all options are fully resolved, so it correctly detects mismatches.
