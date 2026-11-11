---
"@cloudflare/vite-plugin": patch
---

Always name `cf` in actionable messages

Vite plugin v2 is only compatible with `cf`, so messages that tell you which CLI or command to use now always name `cf`. Previously they named Wrangler unless Vite was started by `cf`.
