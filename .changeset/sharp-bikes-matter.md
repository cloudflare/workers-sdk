---
"@cloudflare/vite-plugin": patch
---

Avoid live Worker export inspection when Vite runs in middleware mode

Storybook and other embedded Vite servers run without a Vite-owned HTTP server. In that mode, the plugin now keeps using config-derived Worker export types instead of inspecting the live Worker module graph during startup.
