---
"miniflare": patch
---

Fix inspector proxy connection failure when proxy environment variables are set. Local inspector connections now bypass global proxy settings to ensure proper communication between Miniflare and workerd.
