---
"@cloudflare/vite-plugin": patch
---

Fix builds failing with `Expected "assets-only" or "workers" plugin config` when a framework starts a preview server during the build

Frameworks such as Waku start a Vite preview server with the same plugin instances to generate static files during `vite build`. Since 1.69.0 this made the build fail after static generation. The plugin now skips its final build step in this case, as it did before 1.69.0.
