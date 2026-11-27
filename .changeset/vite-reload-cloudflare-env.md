---
"@cloudflare/vite-plugin": patch
---

Apply changes to `CLOUDFLARE_*` variables in `.env` files when Vite restarts

The plugin copies `CLOUDFLARE_*` variables from `.env` files into `process.env`. When a `.env` file changes, Vite restarts in the same process. The values copied before the restart then took precedence over the edited file, as if they had been set in the shell. A variable changed in or removed from a `.env` file now takes effect after the restart. Variables set in the shell still take precedence.
