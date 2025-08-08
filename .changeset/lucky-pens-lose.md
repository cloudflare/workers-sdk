---
"miniflare": patch
---

fix: enable HTTPS support when proxying to workerd

The Miniflare dev-registry proxy previously assumed workerd would always use HTTP,
so enabling `https` on miniflare might caused connection failures in some setups.

This ensures proxying works whether the option is enabled or not.
