---
"wrangler": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/workers-auth": patch
"@cloudflare/remote-bindings": patch
---

Support `CLOUDFLARE_AUTH_PROFILE` for shared authentication profile selection

Cloudflare tooling can pass a selected profile to child processes through `CLOUDFLARE_AUTH_PROFILE`. Explicit profile arguments take precedence over the variable, followed by directory bindings and the default profile. The `cf-wrangler` development delegate also initializes cf authentication so it reads the selected cf credentials.
