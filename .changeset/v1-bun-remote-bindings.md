---
"@cloudflare/vite-plugin": patch
---

Report unsupported remote bindings under Bun instead of hanging

Starting remote bindings now fails with an actionable error explaining Bun's unsupported request routing. Use Node.js or disable remote bindings to continue local development.
