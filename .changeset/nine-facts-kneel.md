---
"@cloudflare/vite-plugin": patch
---

fix: avoid crashing on unknown service bindings at startup

With Dev Registry support, the plugin no longer throws an assertion error during startup when a service binding references a named entrypoint from an unknown worker. Instead, an appropriate runtime error will be returned if the worker cannot be resolved.
