---
"@cloudflare/workers-shared": patch
---

fix: Stabilize Workers naming across `workers-shared`

The Asset Worker and Router Worker use inconsistent naming conventions across `workers-shared`. This commit stabilizes the naming to Asset Worker and Router Worker and permutations of those.
