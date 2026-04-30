---
"miniflare": minor
---

Support V2 protocol for module fallback service

When the `new_module_registry` compatibility flag is set, requests sent to `unsafeModuleFallbackService()` use a different protocol. Miniflare now supports both protocols and exports a `parseModuleFallbackRequest()` utility to ease handling.
