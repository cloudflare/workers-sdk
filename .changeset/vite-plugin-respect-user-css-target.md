---
"@cloudflare/vite-plugin": patch
---

Respect the user's `build.cssTarget` in Worker environments

Only apply the `es2024` CSS default when neither the top-level nor the Worker environment's `build.cssTarget` is set. This prevents Vite's array merging from lowering explicit browser targets and adding unwanted CSS polyfills.
