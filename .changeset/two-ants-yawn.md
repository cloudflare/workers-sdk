---
"@cloudflare/vite-plugin": patch
---

Fix Sandbox SDK preview URL WebSocket routing

When using Sandbox SDK preview URLs, WebSocket requests using the `vite-hmr` protocol could be dropped before they reached the worker, causing HMR to fail. The plugin now forwards Sandbox WebSocket traffic and preserves the original request origin/host so worker proxy logic receives the correct URL.
