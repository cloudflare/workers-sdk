---
"@cloudflare/vite-plugin": minor
---

Update the development registry to use the canonical Cloudflare path

Upgrade Miniflare to 5.20261023.1-beta and Wrangler to 4.154.0. Vite plugin v1 now uses `CLOUDFLARE_DEV_REGISTRY_PATH` or `<Cloudflare config directory>/dev-registry/v5` for Worker discovery. `MINIFLARE_REGISTRY_PATH` is no longer read. When mixing Vite and Wrangler development sessions, set the same `CLOUDFLARE_DEV_REGISTRY_PATH` for both because Wrangler retains its legacy default.
