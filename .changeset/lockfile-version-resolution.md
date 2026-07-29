---
"@cloudflare/workers-utils": minor
"wrangler": patch
---

Resolve installed dependency versions from lockfiles instead of node_modules

Dependency version resolution during deploys now reads from the project's lockfile (pnpm-lock.yaml, package-lock.json, yarn.lock, or bun.lock) before falling back to node_modules. This improves the accuracy of the dependency metadata reported in deploys and speeds up version lookups for projects with many dependencies. All four major package managers are supported.
