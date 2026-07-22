---
"wrangler": patch
---

Handle and explain authentication failures from remote bindings during local development

Wrangler now recognizes authentication failures from remote preview sessions and reports that bindings which need to run remotely require Cloudflare authentication even when the rest of the Worker is developed locally.
