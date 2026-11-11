---
"@cloudflare/vite-plugin": patch
---

Complete v1 builds without rebuilding environments or relying on Vite manifests

Preserve assets imported by entry, child, and prerender Workers when framework plugins build environments first or delete their Vite manifests. Keep the Vite 6 builder callback and Wrangler output configuration used by v1.
