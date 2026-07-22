---
"wrangler": minor
"@cloudflare/vite-plugin": minor
"miniflare": minor
---

Support local container development on Windows

`wrangler dev`, the Vite plugin, and `getPlatformProxy` can now build and run containers on Windows with Docker Desktop, instead of erroring and requiring WSL. Because the Workers runtime can't connect to the Windows Docker named pipe directly, Miniflare now bridges it to a loopback TCP proxy for the runtime while the Docker CLI keeps using the pipe. No configuration is required — existing projects with `containers` / `enable_containers` work as-is.
