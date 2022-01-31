---
"wrangler": patch
---

feat: environments for Worker Sites

This adds environments support for Workers Sites. Very simply, it uses a separate kv namespace that's indexed by the environment name. This PR also changes the name of the kv namespace generated to match wrangler 1's implementation.
