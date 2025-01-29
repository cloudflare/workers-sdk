---
"@cloudflare/unenv-preset": patch
---

Remove `clearImmediate()` and `setImmediate()` injects

These globals are now available in workerd (as of [v1.20240815 - cloudflare/workerd@f07cd8e](https://github.com/cloudflare/workerd/commit/f07cd8e40f53f1607fb1502916a7fe1f9f2b2862)).
