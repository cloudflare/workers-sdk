---
"@cloudflare/vite-plugin": patch
---

Add support for running Vite in middleware mode. This enables using Storybook with the Vite plugin, which would previously crash. WebSocket connections to Workers are not supported when in middleware mode.
