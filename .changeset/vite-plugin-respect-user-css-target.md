---
"@cloudflare/vite-plugin": patch
---

Respect the user's `build.cssTarget` in Worker environments

The plugin set `build.cssTarget` to `es2024` for every Worker environment. Vite merges array-valued build options by appending, so the user's targets ended up combined with `es2024`, and Lightning CSS took the lowest version per browser. A project that pinned `build.cssTarget` to browsers with native `light-dark()` support would get the `prefers-color-scheme` polyfill in its Worker CSS anyway.

The plugin now only applies its `es2024` default when neither `build.cssTarget` nor the Worker environment's own `build.cssTarget` is set.
