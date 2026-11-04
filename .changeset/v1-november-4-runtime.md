---
"@cloudflare/vite-plugin": patch
---

Update the v1 local runtime and remote binding authentication

Use the November 4 runtime and default compatibility date. Local D1 reads outside sessions no longer write bookmarks, local static assets are read-only during preview, and local Secrets Store persistence is restricted to its owner. Remote binding Access login redirects produce an actionable authentication error while responses returned by bindings are preserved. New opt-in cf OAuth logins request the corrected PlanetScale setup scope.
