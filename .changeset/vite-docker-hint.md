---
"@cloudflare/vite-plugin": patch
---

Stop suggesting settings that do not exist when Docker is unavailable

When Docker could not be reached, the error suggested setting `dev.enable_containers` to false in `cloudflare.config.ts` or passing `--enable-containers=false`. `cloudflare.config.ts` has no such setting and the Vite plugin has no such flag, so the error no longer suggests them.
