---
"@cloudflare/quick-edit": patch
---

Fix relative path computation when the root folder name appears multiple times in a path

Previously, the logic assumed the root folder appeared exactly once in the path. When the root folder name appeared more than once, file modifications were not correctly detected.

For example, if the root folder is `my-worker`, a path like `/my-worker/my-worker/util.js` would incorrectly return `/` instead of `/my-worker/util.js`.
