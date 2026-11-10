---
"@cloudflare/vite-plugin": patch
---

Stop emitting Vite manifests for Worker environments by default

Enable `build.manifest` explicitly if your tooling requires these manifests.
