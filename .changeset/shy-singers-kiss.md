---
"@cloudflare/vite-plugin": patch
---

Fix a bug where updating config files would crash the dev server. This occurred because the previous Miniflare instance was not disposed before creating a new one. This would lead to a port collision because of the `inspectorPort` introduced by the new debugging features.
