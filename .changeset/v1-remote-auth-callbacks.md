---
"@cloudflare/vite-plugin": patch
---

Validate OAuth callbacks during remote binding login in Vite development

Upgrade the retained remote-bindings authentication dependency to `@cloudflare/workers-auth` `0.15.4` so unrelated browser callbacks leave the pending login available and provider error text cannot inject terminal control characters.
