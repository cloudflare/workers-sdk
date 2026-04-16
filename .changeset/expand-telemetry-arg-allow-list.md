---
"wrangler": patch
---

Restore telemetry tracking for common CLI flags that were unintentionally dropped during sanitisation

When argument sanitisation was introduced, only explicitly allow-listed args had their values included in telemetry. The allow list was very conservative, which meant common boolean flags like `--remote`, `--json`, `--dry-run`, `--force`, and many others were no longer being captured in `sanitizedArgs` despite previously being tracked. Boolean flags are inherently safe (values are only `true`/`false`), so these have now been added back to the global allow list. A small number of fixed-choice args (`--local-protocol`, `--upstream-protocol`, `--containers-rollout`) have also been added with their known value sets.
