---
"@cloudflare/workers-utils": patch
---

Fix ESM-only packages missing from deploy metadata

ESM-only package dependencies (such as `@cloudflare/think`) were silently omitted from the package dependency metadata reported during `wrangler deploy` and `wrangler versions upload`. These packages are now correctly detected and included.
