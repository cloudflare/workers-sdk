---
"@cloudflare/config": patch
---

Fix the inferred type of `ConfigExportsSchema` to reserve the `settings` key for settings configuration

Parsed config exports now expose `settings` as a settings configuration while treating all other exports as Worker configurations. Validation continues to report specific errors when a settings configuration uses the wrong export name or the reserved name contains a Worker configuration, and now explains how to handle unsupported exports.
