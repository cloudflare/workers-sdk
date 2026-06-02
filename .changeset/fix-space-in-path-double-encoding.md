---
"@cloudflare/vitest-pool-workers": patch
---

Fix module resolution failing when project path contains spaces

When a project lived under a directory with spaces (e.g. `/Users/me/Documents/Master CMS/project`), the vitest pool would fail with `No such module "threads.js"` before any test executed. The module fallback service now uses the `rawSpecifier` from workerd's fallback request to correctly decode `file://` URLs, avoiding the double-encoding of spaces (`%20` → `%2520`) that occurred when workerd resolved these URLs as relative paths.
