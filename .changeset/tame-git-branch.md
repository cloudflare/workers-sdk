---
"@cloudflare/deploy-helpers": patch
---

Avoid treating a detached Git `HEAD` as a branch name for previews and generated aliases. Branch detection now returns no branch for detached checkouts and failed Git commands without printing subprocess errors, while keeping CI branch names and explicitly supplied Preview names intact.
