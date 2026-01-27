---
"@cloudflare/workers-utils": patch
"create-cloudflare": patch
---

Fix compatibility date detection failing when creating new projects

Previously, `getLocalWorkerdCompatibilityDate()` would fail to find the locally installed `miniflare` and `workerd` packages, causing `npm create cloudflare@latest` to fall back to a hardcoded date (2025-09-27) instead of using the current workerd compatibility date.

The issue was that `module.createRequire()` was called with a directory path. Node.js treats this as a filename at that location and looks for `node_modules` in the parent directory rather than the intended directory. This is now fixed by appending `package.json` to the path, which ensures module resolution starts from the correct location.

Fixes #12155
