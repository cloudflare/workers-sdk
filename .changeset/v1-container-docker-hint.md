---
"@cloudflare/vite-plugin": patch
---

Remove unsupported CLI flag advice from v1 Container Docker errors

When Docker is unavailable, suggest disabling local Containers through `dev.enable_containers` in the Wrangler configuration. The Vite plugin does not accept the `--enable-containers` CLI flag.
