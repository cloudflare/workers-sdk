---
"wrangler": patch
---

Fix remote development with static assets for API tokens using granular Worker permissions

Wrangler now creates Workers.dev preview sessions through the Worker-scoped endpoint and derives the preview hostname from the session response. This avoids requiring account-level Workers subdomain access.
