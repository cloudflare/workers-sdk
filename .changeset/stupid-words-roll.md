---
"wrangler": patch
---

containers: `rollout_step_percentage` now also accepts an array of numbers. Previously it accepted a single number, and each rollout step would target the same percentage of instances. Now users can customise percentages for each step.

`rollout_step_percentage` also now defaults to `[10,100]` (previously `25`), which should make rollouts progress slightly faster.
