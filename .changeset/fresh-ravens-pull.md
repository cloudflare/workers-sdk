---
"wrangler": patch
---

fix: Throw error when attempting to configure Workers with assets and tail consumers

Tail Workers are currently not supported for Workers with assets. This commit ensures we throw a corresponding error if users are attempting to configure `tail_consumers` via their configuration file, for a Worker with assets. This validation is applied for all `wrangler dev`, `wrangler deploy`, `wrangler versions upload`.
