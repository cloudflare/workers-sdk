---
"@cloudflare/vite-plugin": patch
---

Reuse Wrangler credentials refreshed by another process during remote development

Update authentication for retained remote bindings so a running Vite server can reuse a valid token saved by another process without another exchange or an older credential write.
