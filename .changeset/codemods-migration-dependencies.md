---
"@cloudflare/codemods": patch
---

Upgrade older Wrangler and Vite plugin dependencies when migrating to `cf`

The codemod now installs supported tool versions with the project's package manager, preserving each dependency section and updating the lockfile. Compatible versions stay unchanged, and dry runs and disabled installation avoid package changes.
