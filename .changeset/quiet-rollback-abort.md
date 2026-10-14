---
"wrangler": patch
---

Fix `wrangler rollback` reporting success after the changed secrets confirmation is declined

Previously, declining the "secrets have changed" confirmation printed "Aborting rollback..." but then also printed a success message and the target version as the "Current Version ID", even though no deployment was made. Wrangler now stops after aborting, so the output matches what is actually deployed.
