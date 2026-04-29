---
"@cloudflare/vite-plugin": minor
---

Support V2 protocol for module fallback service

When the `new_module_registry` compatibility flag is set, requests sent to `unsafeModuleFallbackService()` use a different protocol. The Vite plugin now supports both protocols in its handling of additional module types.
