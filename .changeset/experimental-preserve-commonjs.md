---
"@cloudflare/vite-plugin": minor
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Experimentally preserve npm CommonJS module boundaries with the new module registry

When the `new_module_registry` compatibility flag is enabled, Wrangler and the Cloudflare Vite plugin now preserve statically reachable npm CommonJS files as runtime CommonJS modules instead of embedding them in the Worker ES module. This experimental path preserves CommonJS globals, relative `require()` calls, cycles, JSON imports, and ESM default and named interop across builds, local development, and Vite preview.
