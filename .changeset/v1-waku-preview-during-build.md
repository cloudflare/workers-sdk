---
"@cloudflare/vite-plugin": patch
---

Fix builds failing with `Expected "assets-only" or "workers" plugin config` when a framework starts a preview server during the build

Frameworks such as Waku start a Vite preview server with the same plugin instances to generate static files during `vite build`. Since 1.69.0 this made the build fail after static generation; builds now complete again, as they did in 1.68.0.
