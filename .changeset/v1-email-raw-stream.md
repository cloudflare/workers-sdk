---
"@cloudflare/vite-plugin": patch
---

Expose `EmailMessage.raw` as a byte stream during local development

Preserve string and stream email inputs as readable byte streams, including Unicode content. Keep the remote email proxy compatible with legacy string payloads and the updated runtime payload format.
