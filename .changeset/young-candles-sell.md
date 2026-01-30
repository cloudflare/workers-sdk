---
"@cloudflare/vite-plugin": patch
---

Ensure dev server is fully ready before reporting readiness

Fixed an issue where the dev server could report it was ready before Miniflare was fully initialized. This could cause requests to hang or timeout when fetching from the dev server immediately after startup. The plugin now properly awaits Miniflare's ready state after construction, ensuring reliable dev server startup.
