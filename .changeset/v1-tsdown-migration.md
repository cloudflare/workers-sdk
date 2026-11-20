---
"@cloudflare/vite-plugin": patch
---

Update the plugin build and bundle shared declaration dependencies

Use tsdown 0.22.14 for the plugin and retained remote bindings package, and keep shared SDK types bundled in the published plugin declarations. Validate the declarations from a consumer project without workspace development dependencies.
