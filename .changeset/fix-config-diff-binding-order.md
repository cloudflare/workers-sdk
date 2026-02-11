---
"wrangler": patch
---

Fix spurious config diffs when bindings from local and remote config are shown in different order

When comparing local and remote Worker configurations, binding arrays like `kv_namespaces` would incorrectly show additions and removals if the elements were in a different order. The diff now correctly recognizes these as equivalent by reordering remote arrays to match the local config's order before comparison.
