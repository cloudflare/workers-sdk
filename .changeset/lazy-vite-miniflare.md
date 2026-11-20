---
"@cloudflare/vite-plugin": patch
---

Avoid loading Miniflare during bundle-only Vite builds

The plugin now loads Miniflare when it needs the local runtime, such as for development, preview, or regenerating runtime types. Builds that only bundle Workers and assets no longer pay the cost of loading Miniflare.
