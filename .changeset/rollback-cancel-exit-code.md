---
"wrangler": patch
---

Fix `wrangler rollback` reporting success after the rollback is cancelled

Previously, declining the "The following secrets have changed…" confirmation printed "Aborting rollback..." and then also printed a success message and the target version as the "Current Version ID", even though no deployment was made and the original version was still live. Wrangler now stops when a rollback is cancelled.

A cancelled rollback, whether declined at the initial "Are you sure…" prompt or at the changed secrets prompt, now exits with a non-zero exit code and the error "Rollback cancelled. Your current deployment has not been changed." This lets scripts and CI pipelines tell a cancelled rollback apart from a successful one.
